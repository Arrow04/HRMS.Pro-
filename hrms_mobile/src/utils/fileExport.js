import { Share, Platform, Alert } from 'react-native';
import { downloadAsync, cacheDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../services/api';

export async function shareTextAsCsv(csvContent, filename = 'report') {
  if (!csvContent?.trim()) {
    Alert.alert('Export', 'No data to export.');
    return false;
  }
  try {
    await Share.share({
      title: `${filename}.csv`,
      message: csvContent,
    });
    return true;
  } catch {
    Alert.alert('Export', 'Could not share the file.');
    return false;
  }
}

export async function downloadAndShareFile(path, filename, mimeType = 'application/octet-stream') {
  const token = await SecureStore.getItemAsync('auth_token');
  const url = `${API_BASE_URL}${path}`;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileUri = `${cacheDirectory}${safeName}`;

  try {
    const result = await downloadAsync(url, fileUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (result.status !== 200) {
      throw new Error(`Download failed (${result.status})`);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: safeName });
    } else if (Platform.OS === 'web') {
      await Share.share({ url: result.uri, title: safeName });
    } else {
      Alert.alert('Export', `File saved to cache: ${safeName}`);
    }
    return true;
  } catch (e) {
    Alert.alert('Export failed', e.message || 'Could not download the file.');
    return false;
  }
}

export function rowsToCsv(rows) {
  if (!rows?.length) return '';
  if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    rows.forEach((row) => {
      lines.push(headers.map((h) => {
        const val = row[h] ?? '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(','));
    });
    return lines.join('\n');
  }
  return rows.map((r) => (Array.isArray(r) ? r.join(',') : String(r))).join('\n');
}
