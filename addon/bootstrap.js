/* SPDX-License-Identifier: GPL-3.0-or-later */
var pluginScope;

async function startup({ id, rootURI }) {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  pluginScope = { Zotero, Services, ChromeUtils, Cc, Ci, Cu, IOUtils, TextDecoder, TextEncoder, WebAssembly, setInterval, clearInterval, setTimeout, clearTimeout };
  Services.scriptloader.loadSubScript(rootURI + "content/plugin.js", pluginScope);
  Zotero.LocalDictionary = pluginScope.LocalDictionaryModule.createApp(pluginScope, id);
  // Preserve the old API alias and preference namespace for in-place upgrades.
  Zotero.LocalMDXClick = Zotero.LocalDictionary;
  await Zotero.LocalMDXClick.start();
}

function shutdown() {
  Zotero.LocalMDXClick?.stop();
  delete Zotero.LocalMDXClick;
  delete Zotero.LocalDictionary;
  pluginScope = undefined;
}

function install() {}
function uninstall() {}
