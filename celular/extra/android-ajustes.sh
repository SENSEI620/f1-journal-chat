#!/bin/sh
# Ajustes no projeto Android gerado (roda no GitHub Actions, depois do "cap sync"): ícone pequeno do aviso + permissão de notificação.
set -e
M=android/app/src/main/AndroidManifest.xml
mkdir -p android/app/src/main/res/drawable
cat > android/app/src/main/res/drawable/ic_stat_chat.xml <<'XML'
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="M20,2H4C2.9,2 2,2.9 2,4v18l4,-4h14c1.1,0 2,-0.9 2,-2V4C22,2.9 21.1,2 20,2z"/>
</vector>
XML
grep -q POST_NOTIFICATIONS "$M" || sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#&\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />#' "$M"
grep -q default_notification_icon "$M" || sed -i 's#</application>#    <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_chat" />\n    </application>#' "$M"
echo "Ajustes do Android feitos."
