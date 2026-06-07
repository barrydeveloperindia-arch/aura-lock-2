import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export const downloadFile = async (data, filename, mimeType) => {
    try {
        if (!Capacitor.isNativePlatform()) {
            // Web Download
            const blob = new Blob([data], { type: mimeType });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            return;
        }

        // Native Download (Android/iOS)
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Base64 conversion failed'));
            reader.readAsDataURL(new Blob([data]));
        });

        const base64Data = await base64Promise;

        // Try writing to Documents directory so it's visible in the "Docs" / "Files" app
        const savedFile = await Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: Directory.Documents
        });

        // Use Share API - This should open the Android "Share Sheet"
        await Share.share({
            title: filename,
            text: `EngLabs Attendance Report: ${filename}`,
            url: savedFile.uri,
        });

    } catch (err) {
        console.error('Download System Error:', err);
        alert('Download Error: ' + err.message);
    }
};
