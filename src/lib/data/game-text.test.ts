import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseGameText, type Block } from './game-text';

/** A block as plain text, for the assertions that are about structure. */
const plain = (blocks: Block[]) => blocks.map((block) => ({
  kind: block.kind,
  text: block.lines.map((line) => line.filter((run) => run.layout !== 'touch').map((run) => run.text).join('')),
}));

test('each part of a talent is its own heading over its own paragraph', () => {
  const blocks = parseGameText(
    '<color=#FFD780FF>Ataque Normal</color>\nRealiza hasta 4 ataques.\n\n<color=#FFD780FF>Ataque Cargado</color>\nConsume Aguante.',
  );

  assert.deepEqual(plain(blocks), [
    { kind: 'heading', text: ['Ataque Normal'] },
    { kind: 'paragraph', text: ['Realiza hasta 4 ataques.'] },
    { kind: 'heading', text: ['Ataque Cargado'] },
    { kind: 'paragraph', text: ['Consume Aguante.'] },
  ]);
});

test('an element\'s colour marks its damage, and gold marks a term inside a sentence', () => {
  const [block] = parseGameText('Inflige <color=#99FF88FF>Daño Dendro</color> y crea <color=#FFD780FF>briznas</color>.');

  assert.equal(block.kind, 'paragraph');
  assert.deepEqual(block.lines[0].map((run) => [run.text, run.tone]), [
    ['Inflige ', null], ['Daño Dendro', 'dendro'], [' y crea ', null], ['briznas', 'highlight'], ['.', null],
  ]);
});

test('the flavour line is its own block, and the template flag is not text', () => {
  const blocks = parseGameText('#Golpea al enemigo.\n\n<i>“Jeje, esto es para los que roban.”</i>');

  assert.deepEqual(plain(blocks), [
    { kind: 'paragraph', text: ['Golpea al enemigo.'] },
    { kind: 'flavor', text: ['“Jeje, esto es para los que roban.”'] },
  ]);
});

test('a phrase per device keeps the pointer\'s and the touch screen\'s, and drops the console\'s', () => {
  const [heading] = parseGameText(
    '<color=#FFD780FF>{LAYOUT_MOBILE#Un toque}{LAYOUT_PC#Pulsar una vez}{LAYOUT_PS#Pulsar una vez}</color>\nSalta.',
  );

  assert.equal(heading.kind, 'heading');
  assert.deepEqual(heading.lines[0].map((run) => [run.text, run.layout]), [
    ['Un toque', 'touch'], ['Pulsar una vez', 'pointer'],
  ]);
});

test('links, non-breaking spaces and the Traveler\'s gender resolve to text', () => {
  const [block] = parseGameText(
    'Usa {LINK#N11430001}armamento{/LINK} durante 12{NON_BREAK_SPACE}s para ser agraciad{F#a}{M#o}.',
    { gender: 'F' },
  );

  assert.equal(block.lines[0].map((run) => run.text).join(''), 'Usa armamento durante 12 s para ser agraciada.');
});

test('a highlighted sentence is emphasis, not a heading', () => {
  const blocks = parseGameText('<color=#FFD780FF>Este efecto no se acumula.</color>\nOtra línea.');

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'paragraph');
});

test('plain text still breaks into its paragraphs', () => {
  assert.deepEqual(plain(parseGameText('Primera parte.\n\nSegunda parte.')), [
    { kind: 'paragraph', text: ['Primera parte.'] },
    { kind: 'paragraph', text: ['Segunda parte.'] },
  ]);
  assert.deepEqual(parseGameText(''), []);
});

test('lines that open on the game\'s bullet are a list, without the bullet', () => {
  const blocks = parseGameText(
    '<color=#FFD780FF>Paquete minino</color>\n·Inflige <color=#99FF88FF>Daño Dendro</color>.\n·Esprintar cancela este estado.',
  );

  assert.deepEqual(plain(blocks), [
    { kind: 'heading', text: ['Paquete minino'] },
    { kind: 'list', text: ['Inflige Daño Dendro.', 'Esprintar cancela este estado.'] },
  ]);
});
