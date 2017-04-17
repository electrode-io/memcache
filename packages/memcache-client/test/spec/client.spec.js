"use strict";

const MemcacheClient = require("../..");
const chai = require("chai");
const expect = chai.expect;

describe("memcache client", function () {
  process.on("unhandledRejection", (e) => {
    console.log("unhandledRejection", e);
  });

  // const server = "localhost:8889"
  const server = "10.1.1.1:11211";

  const text1 = `\r\n为推动创造一个自由百科全书目标的实现，维基百科已经形成了一套方针与指引，实际上而言是一套硬性规则，用户强制需要遵循。
方针是我们认为所应当遵循的标准，指引则用于指导具体情况下标准的执行。它们是社区共识的反映，适用于所有编辑者。
尽管维基百科的方针和指引持续地在演进，许多维基人仍感到成文规则有其不可避免的欠缺性，难以覆盖所有可能形式的干扰或恶意行为。
但无论如何，只要用户的行为与成文方针及指引的内在精神背道而驰，便可能受到谴责，即便没有违反文字形式的规定。
反之，抱持善意、展现文明、寻求共识并且致力创造一部中立百科全书的人，将受到大家的欢迎。\r\ntest\r\nblah\r\nhello`;

  const text2 = `END\r\nVALUE xyz 1 2 3\r\n滨海新区，是中华人民共和国天津市下辖的副省级区、国家级新区和国家综合配套改革试验区，
位于天津东部沿海地区，环渤海经济圈的中心地带，总面积2,270平方公里，人口248万人，是中国北方对外开放的门户、高水平的现代制造业和研发转化基地、
北方国际航运中心和国际物流中心、宜居生态型新城区，被誉为“中国经济的第三增长极”。
1994年3月，天津市决定在天津经济技术开发区、天津港保税区的基础上“用十年左右的时间，基本建成滨海新区”。
经过天津市10余年自主发展后，\n\r滨海新区在2005年开始被写入“十一五”规划并纳入国家发展战略，成为国家重点支持开发开放的国家级新区。
滨海新区的官方英文名称确定为Binhai New Area。2011年11月，滨海新区确定滨海精神为“开放创新、引领未来”。
2014年，滨海新区生产总值达到8760.15亿元。
2015年4月，天津自贸区在滨海新区正式挂牌成立，这将使得滨海新区在快政府职能转变、扩大投资领域开放、推动贸易转型升级，
深化金融开放创新、推动实施京津冀协同发展战略等5个方面获得进一步提升\r\nset text1 0 5 50\r\nhello world\r\n`;

  it("should set and get multiple keys concurrently", () => {
    const key1 = "text1维基百科";
    const key2 = "blah";
    const key3 = "text2天津经济技术开发区";
    const key4 = "number4";
    const key5 = "binary5";
    const numValue = 12345;
    const binValue = Buffer.allocUnsafe(1500);
    const jsonData = { "天津经济技术开发区": text2 };
    const x = new MemcacheClient({ server, ignoreNotStored: true });

    return Promise.all([
      x.set(key1, text1, { compress: true }),
      x.set(key2, "dingle", { compress: false }),
      x.set(key3, jsonData, { compress: true }),
      x.set(key4, numValue),
      x.set(key5, binValue, { compress: true })
    ])
      .then(() =>
        Promise.all([
          x.get(key1), x.get(key2), x.get(key3), x.get(key4), x.get(key5)
        ])
          .then((results) => {
            expect(results).to.deep.equal([text1, "dingle", jsonData, numValue, binValue]);
          }));
  });
});
