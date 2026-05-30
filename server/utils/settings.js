const fs   = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "../../data/settings.json");

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
        return {};
    }
}

function writeSettings(data) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readSettings, writeSettings };
