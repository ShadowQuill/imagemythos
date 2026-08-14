// 由 questionBank.json + dimensions.json 重新生成 data.js（内联，供浏览器端使用）
// 运行：node build_data.js
const fs = require('fs');
const path = require('path');
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'questionBank.json'), 'utf8'));
const dims = JSON.parse(fs.readFileSync(path.join(__dirname, 'dimensions.json'), 'utf8'));
const out = `(function(root){
  const bank = ${JSON.stringify(bank, null, 2)};
  const dims = ${JSON.stringify(dims, null, 2)};
  const data = { bank, dims };
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.AESTHETIC_DATA = data;
}(typeof self !== "undefined" ? self : this));
`;
fs.writeFileSync(path.join(__dirname, 'data.js'), out, 'utf8');
console.log('data.js 已重新生成，含 bank+dimensions，字节数=', out.length);
