#!/usr/bin/env node
/**
 * t7 审查工具：**假墙钟钩子**（只伪造"现在几点"，不动历史）。
 *
 * 被 `node --require <本文件>` 预加载，`FAKE_NOW=<ISO 串>` 时：
 *   · `new Date()`（无参）→ 固定时刻
 *   · `Date.now()` → 固定时刻
 * 显式传参的 `new Date(...)` / `Date.parse` / 原型方法全部原样保留。
 *
 * 用途：把"报告有没有读墙钟"从口号变成可复算的反证 ——
 * 同一份盘上数据、只换墙钟，两次输出做**逐字节 diff**，看哪些字节真的跟着墙钟走。
 */
'use strict';

const FAKE_NOW = process.env.FAKE_NOW;
if (FAKE_NOW) {
  const RealDate = Date;
  const fixed = new RealDate(FAKE_NOW).getTime();
  if (!Number.isFinite(fixed)) {
    throw new Error(`[t7-fake-clock] FAKE_NOW 解析不出来：${FAKE_NOW}`);
  }
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() { return fixed; }
  }
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  global.Date = FakeDate;
  globalThis.__T7_FAKE_NOW__ = FAKE_NOW;
}
