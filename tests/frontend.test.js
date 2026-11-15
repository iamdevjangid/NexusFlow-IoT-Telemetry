const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Frontend UI - dashboard assets exist and are structured correctly', () => {
    const frontendDir = path.join(__dirname, '../frontend');
    assert.ok(fs.existsSync(path.join(frontendDir, 'index.html')), 'index.html must exist');
    assert.ok(fs.existsSync(path.join(frontendDir, 'style.css')), 'style.css must exist');
    assert.ok(fs.existsSync(path.join(frontendDir, 'app.js')), 'app.js must exist');

    const htmlContent = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
    assert.match(htmlContent, /<canvas id="waveformCanvas">/);
    assert.match(htmlContent, /NexusFlow/);
    assert.match(htmlContent, /alertsFeed/);
});
