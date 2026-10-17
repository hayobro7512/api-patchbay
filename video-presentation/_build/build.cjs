// Builds ../patchbay.pptx. Run: node build.cjs   (ONLY=n previews slide n as prev<n>.pptx)
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const fa = require('react-icons/fa');
const path = require('path');
const D = path.join(__dirname, '..') + '/';
const ONLY = process.env.ONLY ? +process.env.ONLY : 0;
const K = { bg: '15171C', card: '1F222A', deep: '0F1115', line: '343843', text: 'F4F4F2', mute: 'A3A7B0', amber: 'F2A43A', green: '4CC38A', red: 'F47067' };
const H = 'Cambria', B = 'Calibri', M = 'Courier New';

const icon = async (name, color = K.amber) => {
  const svg = renderToStaticMarkup(React.createElement(fa[name], { color: '#' + color, size: 256 }));
  return 'image/png;base64,' + (await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer()).toString('base64');
};

(async () => {
  const I = {};
  for (const n of ['FaRss', 'FaRobot', 'FaServer', 'FaCodeBranch', 'FaExclamationTriangle', 'FaEyeSlash', 'FaBookOpen', 'FaPlug', 'FaProjectDiagram', 'FaDollarSign']) I[n] = await icon(n);

  // 30% ring: track plus an amber arc starting at 12 o'clock (r=90, circumference ~565.5)
  const ringSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="960" height="960"><circle cx="120" cy="120" r="90" fill="none" stroke="#2B2F38" stroke-width="26"/><circle cx="120" cy="120" r="90" fill="none" stroke="#F2A43A" stroke-width="26" stroke-linecap="round" stroke-dasharray="169.6 565.5" transform="rotate(-90 120 120)"/></svg>`;
  const ringPng = 'image/png;base64,' + (await sharp(Buffer.from(ringSvg)).png().toBuffer()).toString('base64');
  const pres = new pptxgen(); pres.layout = 'LAYOUT_16x9'; pres.title = 'API Patchbay';
  const T = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, ...o });
  const card = (s, x, y, w, h, name, fill = K.card) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: K.line, width: 0.75 }, objectName: name });
  const iconRing = (s, x, y, d, ic, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: K.bg }, line: { color: K.amber, width: 2.25 }, objectName: name + ' ring' });
    const g = d * 0.46;
    s.addImage({ data: I[ic], x: x + (d - g) / 2, y: y + (d - g) / 2, w: g, h: g, altText: name, objectName: name + ' icon' });
  };
  const title = (s, t) => T(s, t, { x: 0.8, y: 0.5, w: 8.4, h: 0.75, fontFace: H, fontSize: 36, bold: true, color: K.text, valign: 'top', objectName: 'Title' });
  const slides = [];

  slides.push(() => { // 1 title
    const s = pres.addSlide(); s.background = { color: K.bg };
    s.addImage({ path: D + 'logo-amber.png', x: 0.8, y: 0.85, w: 0.95, h: 0.95, altText: 'API Patchbay logo', objectName: 'Logo' });
    T(s, 'API Patchbay', { x: 0.8, y: 2.45, w: 8.4, h: 0.95, fontFace: H, fontSize: 54, bold: true, color: K.text, objectName: 'Title' });
    T(s, "When an API changes, every developer team gets a tested fix.", { x: 0.8, y: 3.5, w: 8.4, h: 0.5, fontFace: B, fontSize: 22, color: K.amber, objectName: 'Subtitle' });
    T(s, 'c0mpiled-14  |  UC Berkeley  |  Agent-first software', { x: 0.8, y: 4.9, w: 8.4, h: 0.3, fontFace: B, fontSize: 12, color: K.mute, objectName: 'Footer' });
    s.addNotes('Title. 3 seconds.');
  });

  slides.push(() => { // 2 problem: doughnut + 3 icon rows
    const s = pres.addSlide(); s.background = { color: K.bg };
    title(s, 'Nobody reads the changelog');
    s.addImage({ data: ringPng, x: 0.95, y: 1.4, w: 3.2, h: 3.2, altText: '30% of AWS downtime came from external API and package changes', objectName: 'Downtime ring' });
    T(s, '30%', { x: 0.95, y: 1.4, w: 3.2, h: 3.2, align: 'center', valign: 'middle', fontFace: H, fontSize: 54, bold: true, color: K.amber, objectName: 'Doughnut center' });
    T(s, 'of AWS downtime: API changes nobody noticed (RFS author, ex-AWS)', { x: 0.8, y: 4.7, w: 3.5, h: 0.5, align: 'center', valign: 'top', fontFace: B, fontSize: 12, color: K.mute, objectName: 'Chart caption' });
    const rows = [['FaExclamationTriangle', 'Breaking changes, no warning'], ['FaEyeSlash', 'Useful features go unseen'], ['FaBookOpen', 'Changelogs go unread']];
    rows.forEach(([ic, t], i) => {
      const y = 1.55 + i * 1.1;
      card(s, 5.0, y, 4.2, 0.9, 'Row card ' + (i + 1));
      iconRing(s, 5.2, y + 0.15, 0.6, ic, 'Row ' + (i + 1));
      T(s, t, { x: 6.0, y, w: 3.1, h: 0.9, valign: 'middle', fontFace: B, fontSize: 16, bold: true, color: K.text, objectName: 'Row text ' + (i + 1) });
    });
    s.addNotes('At AWS, over 30% of downtime came from API changes nobody noticed. 10 seconds.');
  });

  slides.push(() => { // 3 solution: icon flow + diff card
    const s = pres.addSlide(); s.background = { color: K.bg };
    title(s, 'The provider ships once');
    const steps = [['FaRss', 'Change feed', 'Provider publishes'], ['FaRobot', 'Update agent', 'Patches the code'], ['FaServer', 'Freestyle VM', 'Tests in a clean VM'], ['FaCodeBranch', 'Pull request', 'Dev team merges']];
    steps.forEach(([ic, h, d], i) => {
      const x = 0.8 + i * 2.2, rx = x + 0.55;
      iconRing(s, rx, 1.4, 0.7, ic, 'Step ' + (i + 1));
      T(s, h, { x, y: 2.2, w: 1.8, h: 0.3, align: 'center', fontFace: B, fontSize: 16, bold: true, color: K.text, valign: 'top', objectName: 'Step title ' + (i + 1) });
      T(s, d, { x, y: 2.52, w: 1.8, h: 0.5, align: 'center', fontFace: B, fontSize: 14, color: K.mute, valign: 'top', objectName: 'Step text ' + (i + 1) });
      if (i < 3) s.addShape(pres.shapes.LINE, { x: rx + 0.8, y: 1.75, w: 0.85, h: 0, line: { color: K.amber, width: 1.5, endArrowType: 'triangle' }, objectName: 'Arrow ' + (i + 1) });
    });
    card(s, 0.8, 3.3, 8.4, 1.75, 'Diff card', K.deep);
    T(s, 'company-repo / images.js', { x: 1.05, y: 3.45, w: 4.5, h: 0.3, fontFace: M, fontSize: 12, color: K.mute, objectName: 'Diff file' });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.35, y: 3.43, w: 1.65, h: 0.32, rectRadius: 0.16, fill: { color: K.deep }, line: { color: K.green, width: 1.25 }, objectName: 'Pass badge' });
    T(s, 'tests passed', { x: 7.35, y: 3.43, w: 1.65, h: 0.32, align: 'center', valign: 'middle', fontFace: B, fontSize: 12, bold: true, color: K.green, objectName: 'Pass badge text' });
    T(s, '- body: { prompt, size, user }', { x: 1.05, y: 3.9, w: 7.9, h: 0.4, fontFace: M, fontSize: 16, color: K.red, valign: 'middle', objectName: 'Diff removed' });
    T(s, '+ body: { prompt, size, model, safety_identifier }', { x: 1.05, y: 4.4, w: 7.9, h: 0.4, fontFace: M, fontSize: 16, color: K.green, valign: 'middle', objectName: 'Diff added' });
    T(s, "Unlike dependency bots that start from your repo and bump versions, Patchbay starts from the provider's API change and hands every developer team a PR that is already fixed and tested in a clean VM.", { x: 0.8, y: 5.1, w: 8.4, h: 0.42, fontFace: B, fontSize: 11, italic: true, color: K.amber, valign: 'top', objectName: 'Differentiator' });
    s.addNotes('Optional. Real OpenAI change: model became required, user deprecated for safety_identifier.');
  });

  slides.push(() => { // 4 next
    const s = pres.addSlide(); s.background = { color: K.bg };
    title(s, 'What comes next');
    const cols = [['FaPlug', 'Real providers', 'OpenAI change done. Stripe next'], ['FaProjectDiagram', 'Two ways to ship', 'Per-provider agents or one neutral service'], ['FaDollarSign', 'Providers pay', 'Developer teams review and merge']];
    cols.forEach(([ic, h, d], i) => {
      const x = 0.8 + i * 2.9;
      card(s, x, 1.55, 2.6, 2.5, 'Next card ' + (i + 1));
      iconRing(s, x + 0.2, 1.8, 0.8, ic, 'Next ' + (i + 1));
      T(s, h, { x: x + 0.2, y: 2.9, w: 2.2, h: 0.4, fontFace: B, fontSize: 20, bold: true, color: K.text, valign: 'top', objectName: 'Next title ' + (i + 1) });
      T(s, d, { x: x + 0.2, y: 3.35, w: 2.2, h: 0.8, fontFace: B, fontSize: 14, color: K.mute, valign: 'top', objectName: 'Next text ' + (i + 1) });
    });
    T(s, 'The provider ships once. Every developer team gets a tested PR.', { x: 0.8, y: 4.45, w: 8.4, h: 0.4, fontFace: H, fontSize: 20, bold: true, color: K.amber, objectName: 'Closing line' });
    s.addNotes('Closing. 10 seconds.');
  });

  (ONLY ? [slides[ONLY - 1]] : slides).forEach(f => f());
  console.log(await pres.writeFile({ fileName: ONLY ? `prev${ONLY}.pptx` : D + 'patchbay.pptx' }));
})();
