import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, EmptyState, ErrorBox, Row, T } from '@/components/ui';
import { api } from '@/lib/api';
import { draftStore } from '@/lib/draft-store';
import { radius, space, useColors } from '@/theme';

/** Screen 5: Live PDF preview & export. */
export default function ExportScreen() {
  const { resumeId, jobId, draftKey } = useLocalSearchParams<{ resumeId: string; jobId?: string; draftKey: string }>();
  const c = useColors();
  const resume = draftStore.get(draftKey);
  const [notice, setNotice] = useState<string | null>(null);

  // Same HTML the PDF is printed from, so the preview matches on iOS and Android.
  const preview = useQuery({
    queryKey: ['preview', resumeId, resume],
    enabled: !!resume,
    queryFn: () => api.previewHtml(resumeId, resume!),
    gcTime: 0,
  });

  // Render the PDF on the server, then download it to the device cache.
  const pdf = useQuery({
    queryKey: ['pdf', resumeId, jobId, resume],
    enabled: !!resume,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async () => {
      const result = await api.exportPdf(resumeId, { resume, jobId });
      const file = await File.downloadFileAsync(result.url, new File(Paths.cache, result.fileName), { idempotent: true });
      return { ...result, file };
    },
  });

  if (!resume) return <EmptyState title="Nothing to preview" message="Go back and open the preview from the editor." />;

  const share = async () => {
    if (!pdf.data) return;
    if (!(await Sharing.isAvailableAsync())) {
      setNotice('Sharing is not available on this device.');
      return;
    }
    await Sharing.shareAsync(pdf.data.file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: pdf.data.fileName });
  };

  const openPdf = async () => {
    if (!pdf.data) return;
    try {
      await pdf.data.file.preview();
    } catch {
      await share();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['bottom']}>
      <View style={{ flex: 1, margin: space.lg, marginBottom: space.sm, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: '#fff' }}>
        {preview.error ? (
          <ErrorBox error={preview.error} onRetry={() => void preview.refetch()} />
        ) : preview.data ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: preview.data }}
            style={{ flex: 1, backgroundColor: '#fff' }}
            scalesPageToFit
            setBuiltInZoomControls
            accessibilityLabel="Resume preview"
          />
        ) : (
          <ActivityIndicator style={{ marginTop: 80 }} />
        )}
      </View>

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}>
        {pdf.error ? <T color="danger" variant="caption">PDF export failed: {(pdf.error as Error).message}</T> : null}
        {notice ? <T variant="caption" color="warning">{notice}</T> : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="caption" numberOfLines={1} style={{ flex: 1 }}>
            {pdf.data ? `${pdf.data.fileName} · ${pdf.data.paper} · ${Math.round(pdf.data.bytes / 1024)} KB` : pdf.isFetching ? 'Generating PDF…' : ' '}
          </T>
        </Row>
        <Row gap={space.sm}>
          <Button style={{ flex: 1 }} title="Share / Save" icon="⤴" onPress={() => void share()} disabled={!pdf.data} loading={pdf.isFetching} />
          <Button style={{ flex: 1 }} title="Open PDF" variant="secondary" onPress={() => void openPdf()} disabled={!pdf.data} />
        </Row>
        {pdf.data?.applyUrl ? (
          <Button title="Apply on company site ↗" variant="secondary" onPress={() => void WebBrowser.openBrowserAsync(pdf.data!.applyUrl!)} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
