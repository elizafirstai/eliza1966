// The proof: run the JavaScript port against the conversation Weizenbaum
// printed in "ELIZA — A Computer Program For the Study of Natural Language
// Communication Between Man and Machine", Communications of the ACM 9(1),
// January 1966, using the DOCTOR script printed in the same paper.
// Every reply must match the paper word for word.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Eliza, slipHash } from '../site/js/engine.js';

const script = readFileSync(new URL('../original/tape.200', import.meta.url), 'utf8');

// [what the young woman typed, what ELIZA answered] as printed in the paper.
// ELIZA's output is shown the way the 7094 printed it.
const PAPER = [
  ['Men are all alike.', 'IN WHAT WAY'],
  ["They're always bugging us about something or other.", 'CAN YOU THINK OF A SPECIFIC EXAMPLE'],
  ['Well, my boyfriend made me come here.', 'YOUR BOYFRIEND MADE YOU COME HERE'],
  ["He says I'm depressed much of the time.", 'I AM SORRY TO HEAR YOU ARE DEPRESSED'],
  ["It's true. I am unhappy.", 'DO YOU THINK COMING HERE WILL HELP YOU NOT TO BE UNHAPPY'],
  ['I need some help, that much seems certain.', 'WHAT WOULD IT MEAN TO YOU IF YOU GOT SOME HELP'],
  ['Perhaps I could learn to get along with my mother.', 'TELL ME MORE ABOUT YOUR FAMILY'],
  ['My mother takes care of me.', 'WHO ELSE IN YOUR FAMILY TAKES CARE OF YOU'],
  ['My father.', 'YOUR FATHER'],
  ['You are like my father in some ways.', 'WHAT RESEMBLANCE DO YOU SEE'],
  ["You are not very aggressive but I think you don't want me to notice that.", 'WHAT MAKES YOU THINK I AM NOT VERY AGGRESSIVE'],
  ["You don't argue with me.", "WHY DO YOU THINK I DON'T ARGUE WITH YOU"],
  ['You are afraid of me.', 'DOES IT PLEASE YOU TO BELIEVE I AM AFRAID OF YOU'],
  ['My father is afraid of everybody.', 'WHAT ELSE COMES TO MIND WHEN YOU THINK OF YOUR FATHER'],
  ['Bullies.', 'DOES THAT HAVE ANYTHING TO DO WITH THE FACT THAT YOUR BOYFRIEND MADE YOU COME HERE'],
];

test('greeting comes from the script', () => {
  assert.equal(new Eliza(script).greeting, 'HOW DO YOU DO . PLEASE TELL ME YOUR PROBLEM');
});

test('the 1966 CACM conversation, reply by reply', () => {
  const eliza = new Eliza(script);
  for (const [said, answered] of PAPER) {
    assert.equal(eliza.respond(said).reply, answered, `after "${said}"`);
  }
});

test('MEMORY uses the original SLIP HASH over 7094 BCD', () => {
  // "HERE" hashes to 3, which picks the fourth MEMORY form,
  // "DOES THAT HAVE ANYTHING TO DO WITH THE FACT THAT YOUR 3".
  assert.equal(slipHash('HERE', 2), 3);
});

test('no randomness: same input, same conversation', () => {
  const run = () => { const e = new Eliza(script); return PAPER.map(([s]) => e.respond(s).reply); };
  assert.deepEqual(run(), run());
});
