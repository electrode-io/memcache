"use strict";

/* eslint-disable no-unused-vars,no-irregular-whitespace */

const MemcacheClient = require("../..");
const chai = require("chai");
const expect = chai.expect;
const Promise = require("bluebird");
const Fs = require("fs");
const Path = require("path");
const memcached = require("memcached-njs");

describe("memcache client", function () {
  process.on("unhandledRejection", (e) => {
    console.log("unhandledRejection", e);
  });

  let memcachedServer;
  let server;

  const restartMemcachedServer = () => {
    if (memcachedServer) {
      memcachedServer.shutdown();
    }
    return memcached.startServer().then((ms) => {
      console.log("memcached server started");
      server = `localhost:${ms._server.address().port}`;
      memcachedServer = ms;
    });
  };

  before((done) => {
    if (process.env.MEMCACHED_SERVER) {
      server = process.env.MEMCACHED_SERVER;
      done();
    } else {
      restartMemcachedServer().then(() => done()).catch(done);
    }
  });

  after((done) => {
    if (memcachedServer) {
      memcachedServer.shutdown();
    }
    done();
  });

  const crlfify = (m) => m.replace(/\r?\n/g, "\r\n");

  const text1 = crlfify(
    `\r\n为推动创造一个自由百科全书目标的实现，维基百科已经形成了一套方针与指引，实际上而言是一套硬性规则，用户强制需要遵循。
方针是我们认为所应当遵循的标准，指引则用于指导具体情况下标准的执行。它们是社区共识的反映，适用于所有编辑者。
尽管维基百科的方针和指引持续地在演进，许多维基人仍感到成文规则有其不可避免的欠缺性，难以覆盖所有可能形式的干扰或恶意行为。
但无论如何，只要用户的行为与成文方针及指引的内在精神背道而驰，便可能受到谴责，即便没有违反文字形式的规定。
反之，抱持善意、展现文明、寻求共识并且致力创造一部中立百科全书的人，将受到大家的欢迎。\r\ntest\r\nblah\r\nhello`);

  const text2 = crlfify(
    `END\r\nVALUE xyz 1 2 3\r\n滨海新区，是中华人民共和国天津市下辖的副省级区、国家级新区和国家综合配套改革试验区，
位于天津东部沿海地区，环渤海经济圈的中心地带，总面积2,270平方公里，人口248万人，是中国北方对外开放的门户、高水平的现代制造业和研发转化基地、
北方国际航运中心和国际物流中心、宜居生态型新城区，被誉为“中国经济的第三增长极”。
1994年3月，天津市决定在天津经济技术开发区、天津港保税区的基础上“用十年左右的时间，基本建成滨海新区”。
经过天津市10余年自主发展后，\n\r滨海新区在2005年开始被写入“十一五”规划并纳入国家发展战略，成为国家重点支持开发开放的国家级新区。
滨海新区的官方英文名称确定为Binhai New Area。2011年11月，滨海新区确定滨海精神为“开放创新、引领未来”。
2014年，滨海新区生产总值达到8760.15亿元。
2015年4月，天津自贸区在滨海新区正式挂牌成立，这将使得滨海新区在快政府职能转变、扩大投资领域开放、推动贸易转型升级，
深化金融开放创新、推动实施京津冀协同发展战略等5个方面获得进一步提升\r\nset text1 0 5 50\r\nhello world\r\n`);

  const poem1 = crlfify(`

 《菩萨蛮·风柔日薄春犹早》

 李清照

    风柔日薄春犹早，
    夹衫乍著心情好。
    睡起觉微寒，
    梅花鬓上残。

    故乡何处是？
    忘了除非醉。
    沈水卧时烧，
    香消酒未消。

`);

  const poem2 = crlfify(`

 《雁邱词》

 元好问

    问世间情是何物，直教生死相许。
    天南地北双飞客，老翅几回寒暑。
    欢乐趣，离别苦，就中更有痴儿女。
    君应有语，渺万里层云，千山暮雪，只影向谁去。
    横汾路，寂寞当年箫鼓，荒烟依旧平楚。
    招魂楚些何嗟及，山鬼暗啼风雨。
    天也妒，未信与，莺儿燕子俱黄土。
    千秋万古，为留待骚人，狂歌痛饮，来访雁邱处。

`);

  const poem3 = crlfify(`

 《滕王閣序》

 王勃

    滕王高閣臨江渚，佩玉鳴鸞罷歌舞。
    畫棟朝飛南浦雲，珠簾暮捲西山雨。
    閒雲潭影日悠悠，物換星移幾度秋。
    閣中帝子今何在？檻外長江　自流！

`);

  const poem4 = crlfify(`

 《送杜少府之任蜀州》

 王勃

    城阙辅三秦，风烟望五津。
    与君离别意，同是宦游人。
    海内存知己，天涯若比邻。
    无为在歧路，儿女共沾巾。

`);

  it("should take a custom logger if it's not undefined", () => {
    const x = new MemcacheClient({ server, logger: null });
    expect(x._logger).to.be.null;
  });

  it("should use established connection", () => {
    const x = new MemcacheClient({ server });
    x.connection = "test";
    return x._connect(server).then((v) => expect(v).to.equal("test"));
  });

  it("should use callback on get and set", (done) => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    x.set(key, "bar", (err) => {
      expect(err).to.be.not.ok;
      x.get(key, (gerr, data) => {
        expect(gerr).to.be.not.ok;
        expect(data.value).to.equal("bar");
        x.shutdown();
        done();
      });
    });
  });

  it("should use callback for send", (done) => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    x.send(`set ${key} 0 0 5\r\nhello\r\n`, "bar", (err, data) => {
      expect(err).to.be.not.ok;
      expect(data).to.deep.equal(["STORED"]);
      x.send(`get ${key}\r\n`, (gerr, v) => {
        expect(gerr).to.be.not.ok;
        expect(v[key].value).to.equal("hello");
        x.shutdown();
        done();
      });
    });
  });

  it("should set value with custom lifetime", () => {
    const x = new MemcacheClient({ server });
    let testOptions;
    x._callbackSend = (data, options) => (testOptions = options);
    const key = `foo_${Date.now()}`;
    x.set(key, "bar", { lifetime: 500 });
    expect(testOptions.lifetime).to.equal(500);
  });

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

    const verifyArrayResults = (results) => {
      expect(results[0].value).to.equal(text1);
      expect(results[1].value).to.equal("dingle");
      expect(results[2].value).to.deep.equal(jsonData);
      expect(results[3].value).to.equal(numValue);
      expect(results[4].value).to.deep.equal(binValue);
    };

    const verifyResults = (results) => {
      expect(results[key1].value).to.equal(text1);
      expect(results[key2].value).to.equal("dingle");
      expect(results[key3].value).to.deep.equal(jsonData);
      expect(results[key4].value).to.equal(numValue);
      expect(results[key5].value).to.deep.equal(binValue);
    };

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
          .then(verifyArrayResults))
      .then(() =>
        x.get([key1, key2, key3, key4, key5])
          .then(verifyResults)
      )
      .then(() =>
        x.send(`gets ${key1} ${key2} ${key3} ${key4} ${key5}\r\n`)
          .then(verifyResults)
      )
      .then(() =>
        x.send((socket) => socket.write(`gets ${key1} ${key2} ${key3} ${key4} ${key5}\r\n`))
          .then(verifyResults)
      )
      .finally(() => x.shutdown());
  });

  it("should set a binary file and get it back correctly", () => {
    const key1 = `image_${Date.now()}`;
    const key2 = `image_${Date.now()}`;
    const key3 = `image_${Date.now()}`;
    const thumbsUp = Fs.readFileSync(Path.join(__dirname, "../data/thumbs-up.jpg"));
    const x = new MemcacheClient({ server });

    return Promise.all([
      x.set(key1, thumbsUp),
      x.set(key2, thumbsUp),
      x.set(key3, thumbsUp)
    ])
      .then((v) => {
        expect(v).to.deep.equal([["STORED"], ["STORED"], ["STORED"]]);
      })
      .then(() =>
        Promise.all([
          x.get(key1),
          x.get(key2),
          x.get(key3)
        ])
          .then((r) => {
            expect(r[0].value).to.deep.equal(thumbsUp);
            expect(r[1].value).to.deep.equal(thumbsUp);
            expect(r[2].value).to.deep.equal(thumbsUp);
          })
      )
      .finally(() => x.shutdown());
  });

  it("should add an entry and then get NOT_STORED when add it again", () => {
    let addErr;
    const x = new MemcacheClient({ server });
    const key = `poem1-风柔日薄春犹早_${Date.now()}`;
    return Promise.try(() => x.add(key, poem1))
      .then(() => x.get(key))
      .then((r) => expect(r.value).to.equal(poem1))
      .then(() => x.add(key, poem1))
      .catch((err) => (addErr = err))
      .then(() => expect(addErr.message).to.equal("NOT_STORED"))
      .finally(() => x.shutdown());
  });

  const testReplace = (setCompress, replaceCompress) => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem2, { compress: setCompress }))
      .then(() => x.get(key))
      .then((r) => expect(r.value).to.equal(poem2))
      .then(() => x.replace(key, poem3, { compress: replaceCompress }))
      .then(() => x.get(key))
      .then((r) => expect(r.value).to.equal(poem3))
      .finally(() => x.shutdown());
  };

  it("should set an entry and then replace it", () => {
    return testReplace();
  });

  it("should set an entry and then replace it (with compress)", () => {
    return testReplace(undefined, true);
  });

  it("should set an entry and then append to it", () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem2))
      .then(() => x.get(key))
      .then((r) => expect(r.value).to.equal(poem2))
      .then(() => x.append(key, poem3))
      .then(() => x.get(key))
      .then((r) => expect(r.value).to.equal(`${poem2}${poem3}`))
      .finally(() => x.shutdown());
  });

  it("should set an entry and then prepend to it", () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem4))
      .then(() => x.get(key))
      .then((r) => expect(r.value).to.equal(poem4))
      .then(() => x.prepend(key, poem3))
      .then(() => x.get(key))
      .then((r) => expect(r.value).to.equal(`${poem3}${poem4}`))
      .finally(() => x.shutdown());
  });

  it("should set an entry and then cas it", () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem4))
      .then(() => x.gets(key))
      .tap((r) => expect(r.value).to.equal(poem4))
      .tap((r) => expect(r.casUniq).to.be.ok)
      .then((r) => x.cas(key, poem3, { casUniq: r.casUniq, compress: true }))
      .then(() => x.get(key))
      .then((r) => expect(r.value).to.equal(poem3))
      .finally(() => x.shutdown());
  });

  it("should fail cas with an outdated id", () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    let casError;
    return Promise.try(() => x.set(key, poem4))
      .then(() => x.gets(key))
      .tap((r) => expect(r.value).to.equal(poem4))
      .tap((r) => expect(r.casUniq).to.be.ok)
      .then((r) => x.cas(key, poem3, { casUniq: r.casUniq + 500 }))
      .catch((err) => (casError = err))
      .then(() => expect(casError.message).to.equal("EXISTS"))
      .finally(() => x.shutdown());
  });

  it("should incr and decr value", () => {
    const x = new MemcacheClient({ server });
    const key = `num_${Date.now()}`;
    return Promise.try(() => x.set(key, "12345"))
      .then(() => x.cmd(`incr ${key} 5`))
      .then((v) => expect(v).to.equal("12350"))
      .then(() => x.cmd(`decr ${key} 12355`))
      .then((v) => expect(v).to.equal("0"))
      .finally(() => x.shutdown());
  });

  it("should receive stats", () => {
    const x = new MemcacheClient({ server });
    const key = `num_${Date.now()}`;
    return Promise.try(() => x.cmd(`stats`))
      .then((r) => {
        const stat = r.STAT;
        expect(stat).to.be.ok;
        expect(stat).to.be.an("array");
        expect(stat).to.not.be.empty;
      })
      .finally(() => x.shutdown());
  });

  it("should fire and forget if noreply is set", () => {
    const x = new MemcacheClient({ server });
    const key = `poem1_${Date.now()}`;
    return Promise.try(() => x.set(key, poem1, { noreply: true }))
      .then((v) => expect(v).to.be.undefined)
      .then(() => x.get(key))
      .then((v) => expect(v.value).to.deep.equal(poem1))
      .finally(() => x.shutdown());
  });

  it("should retrieve version", () => {
    const x = new MemcacheClient({ server });
    return x.cmd("version").then((v) => {
      expect(v[0]).to.equal("VERSION");
      expect(v[1]).to.be.not.empty;
    });
  });

  it("should handle ECONNRESET socket error", () => {
    if (!memcachedServer) {
      return undefined;
    }
    let firstConnId = 0;
    const x = new MemcacheClient({ server });
    return x.cmd("stats").then((v) => {
      firstConnId = v.STAT[2][1];
      x.connection.socket.emit("error", new Error("ECONNRESET"));
    })
      .then(() => x.cmd("stats")).then((v) => {
        expect(firstConnId).to.not.equal(0);
        expect(firstConnId).to.not.equal(v.STAT[2][1]);
      });
  });

  it("should handle command timeout error", () => {
    if (!memcachedServer) {
      return undefined;
    }
    let firstConnId = 0;
    let timeoutError;
    const x = new MemcacheClient({ server });
    return x.cmd("stats").then((v) => {
      firstConnId = v.STAT[2][1];
      memcachedServer.pause();
    })
      .then(() => Promise.all([x.cmd("stats"), x.get("foo"), x.set("test", "data")]))
      .catch((err) => (timeoutError = err))
      .then(() => {
        expect(timeoutError).to.be.ok;
        expect(timeoutError.message).to.equal("Command timeout");
        memcachedServer.unpause();
        return x.cmd("stats");
      })
      .then((v) => {
        expect(firstConnId).to.not.equal(0);
        expect(firstConnId).to.not.equal(v.STAT[2][1]);
      })
      .finally(() => memcachedServer.unpause());
  });
});
