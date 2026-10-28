import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: 'Slop Blocker',
    description: 'Slop Blocker hides AI-generated content ("AI slop") on webpages. Local-first, no telemetry.',
    permissions: ['storage'],
    // Broad host access is required to filter content on any site and to read image metadata.
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Slop Blocker' },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
  },
});
