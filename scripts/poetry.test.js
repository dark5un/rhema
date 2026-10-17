'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// the poetry rules from poetry.js, run on their own (the screenplay.test.js
// pattern): stanzas are arrays of line strings; the caret is {s, k, col}
const src = fs.readFileSync(path.join(__dirname, '..', 'poetry.js'), 'utf8');
const from = src.indexOf('// ---- poetry rules:');
const to = src.indexOf('// ---- end of poetry rules ----');
assert.ok(from >= 0 && to > from, 'poetry rules section must stay delimited for this test');
const context = vm.createContext({});
vm.runInContext(src.slice(from, to), context);
vm.runInContext(`this.api = { RHEMA_INDENT, rhemaBlank, poemEnterRule, poemGap, poemStanzaSplit,
  poemPoemSplit, poemMoveLine, poemDuplicateLine, poemMergeLine, poemIndentLine };`, context);
const p = context.api;
const plain = (x) => JSON.parse(JSON.stringify(x));

const C = (s, k, col) => ({ s, k, col });

test('Enter rhythm: once is a line, twice a stanza, three times a poem', () => {
  const st = [['first line', 'second']];
  // caret mid-line, first press: the line splits where the caret sits
  assert.equal(p.poemEnterRule(st, C(0, 1, 3), 1), 'line');
  // caret on the empty line the first press made: second press opens a stanza
  assert.equal(p.poemEnterRule([['a', 'b', '']], C(0, 2, 0), 2), 'stanza');
  // Enter at the start of a line (one pushed down): twice splits the stanza there
  assert.equal(p.poemEnterRule([['a', 'b']], C(0, 1, 0), 2), 'stanza');
  // third press at the stanza seam: a new poem
  assert.equal(p.poemEnterRule([['a', 'b', '']], C(0, 2, 0), 3), 'poem');
  assert.equal(p.poemEnterRule([['a'], ['b']], C(1, 0, 0), 3), 'poem');
  // mid-line presses only ever break the line: the rhythm decides at line starts
  assert.equal(p.poemEnterRule([['a', 'bcd']], C(0, 1, 2), 3), 'line');
  // Enter on an already-empty line, first press: nothing
  assert.equal(p.poemEnterRule([['']], C(0, 0, 0), 1), 'none');
  assert.equal(p.poemEnterRule([['a', '', 'b']], C(0, 1, 0), 1), 'none');
  // an indented blank line is still blank
  assert.equal(p.poemEnterRule([['a', '\u2003\u2003']], C(0, 1, 2), 2), 'stanza');
});

test('the gap line a stanza split consumes: the caret line if blank, else the one above', () => {
  assert.equal(p.poemGap(['a', '', 'b'], 1), 1);
  assert.equal(p.poemGap(['a', '', 'b'], 2), 1); // caret at start of 'b': the blank above goes
  assert.equal(p.poemGap(['a', 'b'], 1), -1);    // nothing blank: the caret's line starts the new stanza
  assert.equal(p.poemGap([''], 0), 0);
});

test('Enter twice: the stanza splits at the caret, the blank line becomes the gap', () => {
  // end of flow: 'a b <Enter> <Enter>' — caret on the blank line
  let r = p.poemStanzaSplit([['a', 'b', '']], C(0, 2, 0));
  assert.deepEqual(plain(r.stanzas), [['a', 'b'], ['']]);
  assert.deepEqual(plain(r.caret), C(1, 0, 0));
  // mid-flow: caret at the start of 'b' — b begins the new stanza
  r = p.poemStanzaSplit([['a', 'b']], C(0, 1, 0));
  assert.deepEqual(plain(r.stanzas), [['a'], ['b']]);
  // a blank line above the caret is consumed, not carried
  r = p.poemStanzaSplit([['a', '', 'b']], C(0, 2, 0));
  assert.deepEqual(plain(r.stanzas), [['a'], ['b']]);
  // other stanzas are untouched
  r = p.poemStanzaSplit([['x'], ['a', 'b']], C(1, 1, 0));
  assert.deepEqual(plain(r.stanzas), [['x'], ['a'], ['b']]);
});

test('Enter three times: everything from the caret becomes the next poem', () => {
  // end of flow: the poem so far stays, the new poem starts empty
  let r = p.poemPoemSplit([['a', 'b', '']], C(0, 2, 0));
  assert.deepEqual(plain(r.first), [['a', 'b']]);
  assert.deepEqual(plain(r.second), []);
  // mid-flow: the caret's line opens the new poem
  r = p.poemPoemSplit([['a'], ['b', 'c', 'd']], C(1, 1, 0));
  assert.deepEqual(plain(r.first), [['a'], ['b']]);
  assert.deepEqual(plain(r.second), [['c', 'd']]);
  // a blank line at the seam is consumed
  r = p.poemPoemSplit([['a', '', 'b']], C(0, 2, 0));
  assert.deepEqual(plain(r.first), [['a']]);
  assert.deepEqual(plain(r.second), [['b']]);
  // everything after the caret's stanza follows it into the new poem
  r = p.poemPoemSplit([['a'], ['b'], ['c']], C(1, 0, 0));
  assert.deepEqual(plain(r.first), [['a']]);
  assert.deepEqual(plain(r.second), [['b'], ['c']]);
});

test('move line up/down swaps inside the stanza and reports the edges', () => {
  let r = p.poemMoveLine(['a', 'b', 'c'], 1, -1);
  assert.deepEqual(plain(r.lines), ['b', 'a', 'c']);
  assert.equal(r.k, 0);
  r = p.poemMoveLine(['a', 'b', 'c'], 1, 1);
  assert.deepEqual(plain(r.lines), ['a', 'c', 'b']);
  assert.equal(r.k, 2);
  assert.equal(p.poemMoveLine(['a'], 0, -1), null); // across stanzas: the DOM layer's job
  assert.equal(p.poemMoveLine(['a'], 0, 1), null);
});

test('duplicate line copies under the caret and lands there', () => {
  const r = p.poemDuplicateLine(['a', 'b'], 0);
  assert.deepEqual(plain(r.lines), ['a', 'a', 'b']);
  assert.equal(r.k, 1);
});

test('merge line joins upward and puts the caret at the seam', () => {
  const r = p.poemMergeLine(['abc', 'de'], 1);
  assert.deepEqual(plain(r.lines), ['abcde']);
  assert.equal(r.k, 0);
  assert.equal(r.col, 3);
  assert.equal(p.poemMergeLine(['a'], 0), null); // stanza merge: the DOM layer's job
});

test('indent and unindent follow the NEO Tab rhythm (up to two em spaces)', () => {
  let r = p.poemIndentLine(['line'], 0, true);
  assert.deepEqual(plain(r.lines), ['\u2003\u2003line']);
  r = p.poemIndentLine(r.lines, 0, true);
  assert.deepEqual(plain(r.lines), ['\u2003\u2003line'], 'already indented: no double indent');
  r = p.poemIndentLine(['\u2003\u2003line'], 0, false);
  assert.deepEqual(plain(r.lines), ['line']);
  r = p.poemIndentLine(['\u2003half'], 0, false);
  assert.deepEqual(plain(r.lines), ['half']);
});
