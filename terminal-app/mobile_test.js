const { remote } = require('webdriverio');

const capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'Android',
  // Normally we would use appPackage and appActivity if the app was native.
  // Assuming it's a Chrome web app or we can interact with it if it's already open:
  // If it's a capacitor app, we can specify the package name. 
  // Let's use autoGrantPermissions to accept anything.
  'appium:autoGrantPermissions': true,
  'appium:noReset': true // Don't wipe the app data so we stay logged in
};

const wdioOptions = {
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities
};

async function runTest() {
  console.log("🚀 Starting Appium WebDriver session...");
  let client;
  try {
    client = await remote(wdioOptions);

    console.log("📱 Device connected. Waiting for AuraLock app to be focused...");
    // Just a basic implicit wait
    await client.pause(3000);

    console.log("⚙️  Attempting to click Settings tab...");
    // Here we'd find the settings icon by accessibility id or xpath.
    // If it's a React webview, we might need to switch context to WEBVIEW.
    const contexts = await client.getContexts();
    console.log("Available contexts:", contexts);
    
    // Switch to webview if available (for Capacitor/Cordova apps)
    const webviewContext = contexts.find(c => c.includes('WEBVIEW'));
    if (webviewContext) {
      console.log(`🌐 Switching to ${webviewContext}...`);
      await client.switchContext(webviewContext);
    } else {
      console.log(`⚠️ No WEBVIEW context found, running in NATIVE_APP mode.`);
    }

    // Try finding the 'Rebuild Cache' button
    console.log("🔍 Searching for 'Rebuild Cache' button...");
    
    let rebuildBtn;
    if (webviewContext) {
        // In webview, find by text or selector
        rebuildBtn = await client.$('button=Rebuild Cache');
    } else {
        // In native, find by text via UiSelector
        rebuildBtn = await client.$('android=new UiSelector().textContains("Rebuild Cache")');
    }

    if (await rebuildBtn.isExisting()) {
        console.log("✅ Button found! Clicking...");
        await rebuildBtn.click();
        console.log("✅ Clicked successfully. Test passed.");
    } else {
        console.error("❌ Could not find 'Rebuild Cache' button. Please ensure the app is open and on the Settings screen.");
    }

  } catch (err) {
    console.error("❌ Test failed with error:", err.message);
  } finally {
    if (client) {
      await client.deleteSession();
      console.log("🛑 Session ended.");
    }
  }
}

runTest();
