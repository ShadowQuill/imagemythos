// 极简 SMTP 客户端（零 npm 依赖，仅用 Node 内置 tls）。
// 支持 QQ邮箱 等标准 SMTP：SSL 端口 465（STARTTLS 亦可），AUTH LOGIN。
// 仅用于发送「密码重置验证码」这类纯文本/HTML 小邮件，不做附件等复杂特性。
const tls = require('node:tls');

// 读取 SMTP 配置（每次调用时读环境变量，改 .env 重启即生效）
function cfg() {
  return {
    host: (process.env.SMTP_HOST || 'smtp.qq.com').trim(),
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: (process.env.SMTP_USER || '').trim(),
    pass: (process.env.SMTP_PASS || '').trim(),
    from: (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim(),
    timeoutMs: parseInt(process.env.SMTP_TIMEOUT_MS || '20000', 10),
  };
}
function isSmtpConfigured() {
  const c = cfg();
  return !!(c.host && c.user && c.pass);
}

// 连上 TLS 后等待「欢迎语」的 reader：发一条命令（command 为 null 表示只等回复），
// 直到收到最终回复行（3 位数字 + 空格，排除多行中间的「数字-」），返回该 3 位码。
function cmd(sock, command) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onErr = (e) => { sock.removeListener('data', onData); reject(e); };
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      if (!buf.endsWith('\r\n')) return; // 等完整一行
      const lines = buf.split('\r\n');
      let lastFinal = null;
      for (const ln of lines) if (/^\d{3} /.test(ln)) lastFinal = ln;
      if (lastFinal) {
        sock.removeListener('data', onData);
        sock.removeListener('error', onErr); // 关键：成功路径移除自己的 error listener，避免累积触发 MaxListeners 警告
        resolve(lastFinal.slice(0, 3));
      }
    };
    sock.on('data', onData);
    sock.once('error', onErr);
    if (command !== null) sock.write(command + '\r\n');
  });
}
function connect(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, timeout: timeoutMs, minVersion: 'TLSv1.2' }, () => {
      sock.removeListener('error', reject); // 连接成功后，会话错误改由 sendMail 统一处理
      resolve(sock);
    });
    sock.once('error', reject);
    sock.setTimeout(timeoutMs, () => sock.destroy(new Error('SMTP 连接超时')));
  });
}

function buildMessage({ from, to, subject, text, html }) {
  const subj = '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=';
  const ctype = html ? 'text/html' : 'text/plain';
  const raw = html || text || '';
  // base64 编码正文，避免中文/换行的编码坑；再按 76 字符分行并做 dot-stuffing 防误判结束
  let b64 = Buffer.from(raw, 'utf8').toString('base64');
  const lines = (b64.match(/.{1,76}/g) || []).map((l) => (l.startsWith('.') ? '.' + l : l));
  const body = lines.join('\r\n');
  return [
    'From: ' + from,
    'To: ' + to,
    'Subject: ' + subj,
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: ' + ctype + '; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

async function sendMail({ to, subject, text, html }) {
  const c = cfg();
  if (!isSmtpConfigured()) throw new Error('SMTP 未配置（请在 backend/.env 设置 SMTP_PASS 等）');
  const sock = await connect(c.host, c.port, c.timeoutMs);
  try {
    if ((await cmd(sock, null))[0] !== '2') throw new Error('SMTP 连接被拒');
    if ((await cmd(sock, 'EHLO localhost'))[0] !== '2') throw new Error('EHLO 失败');
    if ((await cmd(sock, 'AUTH LOGIN')) !== '334') throw new Error('服务器不支持 AUTH LOGIN');
    if ((await cmd(sock, Buffer.from(c.user).toString('base64'))) !== '334') throw new Error('用户名被拒');
    if ((await cmd(sock, Buffer.from(c.pass).toString('base64'))) !== '235') {
      throw new Error('SMTP 登录失败：请检查 QQ邮箱 授权码（不是邮箱密码）');
    }
    if ((await cmd(sock, 'MAIL FROM:<' + c.from + '>'))[0] !== '2') throw new Error('MAIL FROM 失败');
    if ((await cmd(sock, 'RCPT TO:<' + to + '>'))[0] !== '2') throw new Error('RCPT TO 失败（收件地址无效）');
    if ((await cmd(sock, 'DATA')) !== '354') throw new Error('DATA 阶段失败');
    const msg = buildMessage({ from: c.from, to, subject, text, html });
    if ((await cmd(sock, msg + '\r\n.'))[0] !== '2') throw new Error('邮件正文被拒');
    await cmd(sock, 'QUIT').catch(() => {});
    return { ok: true };
  } finally {
    try { sock.destroy(); } catch (_) {}
  }
}

// 发送「密码重置验证码」邮件（6 位数字码）
async function sendResetCode(to, code, expireMin) {
  const em = (process.env.ADMIN_EMAIL || to);
  const brand = 'AI 审美测评';
  const text =
    '【' + brand + '】密码重置验证码\n\n' +
    '您申请了账户密码重置。本次验证码为：' + code + '\n' +
    '该验证码 ' + expireMin + ' 分钟内有效，仅限一次使用。\n\n' +
    '如非本人操作，请忽略本邮件，无需任何处理。\n' +
    '（由 ' + brand + ' 自动发送）';
  const html = `<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:24px 0;background:#f4f3f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f8">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:94%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(76,58,168,.12)">
<tr><td style="background:#4c3aa8;background:linear-gradient(135deg,#6d5ae6,#4c3aa8);padding:26px 32px">
<span style="font-size:20px;font-weight:700;color:#ffffff">🎨 ${brand}</span>
</td></tr>
<tr><td style="padding:34px 32px 10px">
<h1 style="margin:0 0 10px;font-size:22px;color:#1f2430;font-weight:700">重置您的密码</h1>
<p style="margin:0;font-size:15px;line-height:1.7;color:#6b7280">我们收到了您的密码重置请求。请使用下面的验证码完成操作：</p>
</td></tr>
<tr><td style="padding:14px 32px 6px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f6f4ff;border:1px solid #e6e0ff;border-radius:14px">
<tr><td align="center" style="padding:26px 16px">
<div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#4c3aa8;font-family:'Courier New',Courier,monospace">${code}</div>
<div style="margin-top:12px;font-size:13px;color:#8b85b8">${expireMin} 分钟内有效 · 仅限一次使用</div>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:18px 32px 8px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fafafa;border-radius:10px">
<tr><td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#9ca3af">⚠️ 如非本人操作，请忽略此邮件，无需做任何处理。验证码不会发给任何人，包括我们的工作人员。</td></tr>
</table>
</td></tr>
<tr><td style="padding:22px 32px;background:#faf9ff;border-top:1px solid #f0eefb">
<p style="margin:0;font-size:12px;color:#b8b3c7">由 ${brand} 自动发送 · ${em}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return sendMail({ to, subject: '【' + brand + '】密码重置验证码', text, html });
}

module.exports = { isSmtpConfigured, sendMail, sendResetCode, cfg };
