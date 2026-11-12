const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const sourceMarker = 'pingme://stop-sharing';

module.exports = function withLocationNotificationAction(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const sourcePath = path.join(
      config.modRequest.projectRoot,
      'node_modules',
      'expo-location',
      'android',
      'src',
      'main',
      'java',
      'expo',
      'modules',
      'location',
      'services',
      'LocationTaskService.kt',
    );
    let source = fs.readFileSync(sourcePath, 'utf8');
    if (source.includes(sourceMarker)) return config;

    source = source.replace(
      'import android.content.Intent\n',
      'import android.content.Intent\nimport android.net.Uri\n',
    );
    source = source.replace(
      '    return builder.setCategory(Notification.CATEGORY_SERVICE)\n',
      `    val stopIntent = Intent(Intent.ACTION_VIEW, Uri.parse("${sourceMarker}")).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      setPackage(packageName)
    }
    val stopPendingIntent = PendingIntent.getActivity(
      this,
      1001,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop sharing", stopPendingIntent)
      .setCategory(Notification.CATEGORY_SERVICE)
`,
    );
    fs.writeFileSync(sourcePath, source);
    return config;
  }]);
};
