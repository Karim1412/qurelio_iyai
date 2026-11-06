/* Offline rendering smoke test: run after npm install from apps/frontend. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = path.resolve(__dirname, '../src/components/file-library/IsoStandardTocView.tsx');
const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText;
const loaded = new Module(source, module);
loaded.filename = source;
loaded.paths = Module._nodeModulePaths(path.dirname(source));
loaded._compile(code, source);
const View = loaded.exports.IsoStandardTocView;
const sections = [{ clauseNumber: '4.1', heading: 'Clause 4.1', title: 'Safety', content: 'COPYRIGHT FOOTER', pageStart: 3, pageEnd: 4 }];
const requirements = [
  { id: 'a', clauseRef: '4.1', clauseTitle: 'Safety', type: 'mandatory', text: 'Pressure shall not exceed 10 kPa.', crossReferences: [], grounded: true },
  { id: 'b', clauseRef: 'UNMAPPED', clauseTitle: '', type: 'conditional', text: 'If used, the device shall be inspected.', crossReferences: [], grounded: true },
  { id: 'c', clauseRef: '4.1', clauseTitle: 'Safety', type: 'informative', text: 'Informative text should be hidden.', crossReferences: [], grounded: true },
];
const html = renderToStaticMarkup(React.createElement(View, { sections, requirements, expandedIdx: 0, onToggle() {} }));
assert.match(html, /Pressure shall not exceed 10 kPa/);
assert.match(html, /Pages 3–4/);
assert.match(html, /Unassigned/);
assert.doesNotMatch(html, /COPYRIGHT FOOTER|Informative text should be hidden/);
const fallbackSections = [{ ...sections[0], requirements: [{ type: 'mandatory', text: 'Legacy requirement shall remain visible.' }] }];
const fallback = renderToStaticMarkup(React.createElement(View, { sections: fallbackSections, requirements: [], expandedIdx: 0, onToggle() {} }));
assert.match(fallback, /Legacy requirement shall remain visible/);
console.log('Standards requirements view: 5 rendering checks passed');
