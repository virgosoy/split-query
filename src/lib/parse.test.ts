import { describe, expect, it } from 'vitest';
import { parseFile, type Item } from './parse';

const fullItem: Item = {
  keywordLine: '1+ 搜索 国内',
  headKeyword: '1+',
  otherLines: ['网页标题', 'http://baidu.com'],
};

describe('parseFile', () => {
  it('按空行切分成多个条目，并忽略文件首尾的多余空行', () => {
    const text = `\n\n常用搜索\n百度 国内 快 1-\n\n1+ 搜索 国内\n网页标题\nhttp://baidu.com\n\n`;
    expect(parseFile(text)).toHaveLength(2);
  });

  it('拆出关键词行、首词与其他行', () => {
    const items = parseFile('1+ 搜索 国内\n网页标题\nhttp://baidu.com');
    expect(items[0]).toEqual(fullItem);
  });

  it('单行条目只有关键词行，首词即整行首词，无其他行', () => {
    const items = parseFile('常用搜索');
    expect(items[0]).toEqual({
      keywordLine: '常用搜索',
      headKeyword: '常用搜索',
      otherLines: [],
    });
  });

  it('兼容 \\r\\n 换行与行首行尾空白', () => {
    const items = parseFile('  mix  \r\n  http://a.com \r\n');
    expect(items[0]).toEqual({
      keywordLine: 'mix',
      headKeyword: 'mix',
      otherLines: ['http://a.com'],
    });
  });

  it('空文件或全空行文件返回空数组', () => {
    expect(parseFile('')).toEqual([]);
    expect(parseFile('\n  \n\n')).toEqual([]);
  });
});
