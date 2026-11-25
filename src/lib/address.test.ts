import { describe, expect, it } from 'vitest';
import { alternativesFor, buildAddressPool, isAddressItem } from './address';
import type { Item } from './parse';

function addressItem(...otherLines: string[]): Item {
  return { keywordLine: '地址', headKeyword: '地址', otherLines };
}

function noteItem(headKeyword: string, ...otherLines: string[]): Item {
  return { keywordLine: headKeyword, headKeyword, otherLines };
}

describe('isAddressItem', () => {
  it('首词严格等于「地址」才算地址条目', () => {
    expect(isAddressItem({ keywordLine: '地址', headKeyword: '地址', otherLines: [] })).toBe(true);
    expect(isAddressItem({ keywordLine: '地址 内网', headKeyword: '地址', otherLines: [] })).toBe(
      true,
    );
    expect(isAddressItem({ keywordLine: '地址栏', headKeyword: '地址栏', otherLines: [] })).toBe(
      false,
    );
    expect(isAddressItem({ keywordLine: '常用搜索', headKeyword: '常用搜索', otherLines: [] })).toBe(
      false,
    );
  });
});

describe('buildAddressPool', () => {
  it('每个基址以同条目内的其他基址为替代，按文件顺序', () => {
    const pool = buildAddressPool([
      addressItem('服务A', 'http://a1.example/', 'http://a2.example/', 'http://a3.example/'),
    ]);
    expect(pool.size).toBe(3);
    expect(alternativesFor('http://a1.example/x', pool)).toEqual([
      { prefix: 'http://a2.example', href: 'http://a2.example/x' },
      { prefix: 'http://a3.example', href: 'http://a3.example/x' },
    ]);
  });

  it('非 URL 行不参与', () => {
    const pool = buildAddressPool([addressItem('说明文字', 'http://a1.example/', 'http://a2.example/')]);
    expect(alternativesFor('http://a1.example/x', pool)).toEqual([
      { prefix: 'http://a2.example', href: 'http://a2.example/x' },
    ]);
  });

  it('地址行带路径或查询时只贡献基址，并按基址去重', () => {
    const pool = buildAddressPool([
      addressItem(
        'https://dev.example.com/app/',
        'https://dev.example.com/?x=1',
        'https://alt.example.com/',
      ),
    ]);
    expect(pool.size).toBe(2);
    expect(alternativesFor('https://dev.example.com/p', pool)).toEqual([
      { prefix: 'https://alt.example.com', href: 'https://alt.example.com/p' },
    ]);
  });

  it('大小写与尾斜杠差异按同一基址去重，显示保留首次出现', () => {
    const pool = buildAddressPool([
      addressItem('http://SERVICE.example', 'http://service.example/', 'http://Alt.example/'),
    ]);
    expect(alternativesFor('http://service.example/a', pool)).toEqual([
      { prefix: 'http://Alt.example', href: 'http://Alt.example/a' },
    ]);
    expect(alternativesFor('http://alt.example/a', pool)).toEqual([
      { prefix: 'http://SERVICE.example', href: 'http://SERVICE.example/a' },
    ]);
  });

  it('多个地址条目共享同一基址时取并集，排除自身', () => {
    const pool = buildAddressPool([
      addressItem('http://prod.example/', 'http://r1.example/'),
      addressItem('http://prod.example/', 'http://q1.example/'),
    ]);
    expect(alternativesFor('http://prod.example/a', pool)).toEqual([
      { prefix: 'http://r1.example', href: 'http://r1.example/a' },
      { prefix: 'http://q1.example', href: 'http://q1.example/a' },
    ]);
  });

  it('单个基址的地址条目与非地址条目都不进入池', () => {
    const pool = buildAddressPool([
      addressItem('http://only.example/'),
      noteItem('常用搜索', 'http://only.example/'),
    ]);
    expect(pool.size).toBe(0);
    expect(alternativesFor('http://only.example/a', pool)).toEqual([]);
  });

  it('没有地址条目时池为空', () => {
    const pool = buildAddressPool([noteItem('常用搜索', 'http://a.example/', 'http://b.example/')]);
    expect(pool.size).toBe(0);
  });
});

describe('alternativesFor', () => {
  const pool = buildAddressPool([
    addressItem('http://baidu.example/', 'http://www.baidu.example/'),
  ]);

  it('替换只动基址，保留路径、查询与哈希', () => {
    expect(alternativesFor('http://baidu.example/path?x=1#h', pool)).toEqual([
      { prefix: 'http://www.baidu.example', href: 'http://www.baidu.example/path?x=1#h' },
    ]);
  });

  it('无尾斜杠、仅有查询或仅有哈希的链接', () => {
    expect(alternativesFor('http://baidu.example', pool)[0]?.href).toBe(
      'http://www.baidu.example/',
    );
    expect(alternativesFor('http://baidu.example?x=1', pool)[0]?.href).toBe(
      'http://www.baidu.example/?x=1',
    );
    expect(alternativesFor('http://baidu.example#h', pool)[0]?.href).toBe(
      'http://www.baidu.example/#h',
    );
  });

  it('scheme 与 host 大小写不敏感，显示保留地址行原样', () => {
    const upper = buildAddressPool([
      addressItem('HTTPS://SERVICE.example/', 'https://Alt.example/'),
    ]);
    expect(alternativesFor('https://service.example/a', upper)).toEqual([
      { prefix: 'https://Alt.example', href: 'https://Alt.example/a' },
    ]);
    expect(alternativesFor('HTTPS://SERVICE.EXAMPLE/a', upper)).toEqual([
      { prefix: 'https://Alt.example', href: 'https://Alt.example/a' },
    ]);
  });

  it('端口必须完全一致，不做默认端口归一', () => {
    const withPort = buildAddressPool([
      addressItem('http://x.example:8080/', 'http://x.example/'),
    ]);
    expect(alternativesFor('http://x.example/a', withPort)).toEqual([
      { prefix: 'http://x.example:8080', href: 'http://x.example:8080/a' },
    ]);
    expect(alternativesFor('http://x.example:8080/a', withPort)).toEqual([
      { prefix: 'http://x.example', href: 'http://x.example/a' },
    ]);
    expect(alternativesFor('http://x.example:9090/a', withPort)).toEqual([]);

    const defaultPort = buildAddressPool([
      addressItem('http://x.example:80/', 'http://y.example/'),
    ]);
    expect(alternativesFor('http://x.example/a', defaultPort)).toEqual([]);
  });

  it('非 http(s) 链接与不在池中的链接没有替代', () => {
    expect(alternativesFor('ftp://baidu.example/a', pool)).toEqual([]);
    expect(alternativesFor('http://other.example/a', pool)).toEqual([]);
  });

  it('替代项按文件顺序', () => {
    const ordered = buildAddressPool([
      addressItem('https://base.example/', 'https://z.example/', 'https://a.example/'),
    ]);
    expect(alternativesFor('https://base.example/p', ordered).map((alt) => alt.prefix)).toEqual([
      'https://z.example',
      'https://a.example',
    ]);
  });

  it('地址行与链接行带描述时只取 URL，描述不进入替换结果', () => {
    const described = buildAddressPool([
      addressItem('http://a1.example/ 主站', 'http://a2.example/ 备用站'),
    ]);
    expect(alternativesFor('http://a1.example/path 主站说明', described)).toEqual([
      { prefix: 'http://a2.example', href: 'http://a2.example/path' },
    ]);
  });
});
