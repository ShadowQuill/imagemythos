// compose.js · M1(映射IP) + M2(出图) 编排层
// 纯映射（M1）永远先跑；出图（M2）按 provider 配置，失败/缺 key 时 generatedImage=null 不阻塞。
const Generator = require('./generator.js');
const { generateImage } = require('./providers');

// engineOutput: engine.run() 输出；opts 透传 generate() 与 generateImage()
async function generatePackage(engineOutput, opts) {
  opts = opts || {};
  const pkg = Generator.generate(engineOutput, opts); // M1：确定性映射
  pkg.generatedImage = await generateImage(pkg.imagePrompt.text, opts); // M2：出图（可降级）
  return pkg;
}

module.exports = { generatePackage };
