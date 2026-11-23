import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { View } from 'react-native';
import { api, type UploadResult } from '@/lib/api';
import { useInvalidateUserData } from '@/lib/session';
import { space } from '@/theme';
import { Button, T } from './ui';

const TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export function ResumeUploader({ onUploaded, label = 'Upload resume (PDF or DOCX)', variant = 'primary' }: {
  onUploaded?: (r: UploadResult) => void;
  label?: string;
  variant?: 'primary' | 'secondary';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const invalidate = useInvalidateUserData();

  const pick = async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true);
    try {
      const r = await api.uploadResume(picked.assets[0].uri);
      setResult(r);
      invalidate();
      onUploaded?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <Button title={busy ? 'Reading your resume…' : label} icon="📄" onPress={pick} loading={busy} variant={variant} />
      {error ? <T variant="caption" color="danger">{error}</T> : null}
      {result ? (
        <View style={{ gap: 4 }}>
          <T variant="caption" color="success">
            ✓ Read {result.resume.experience.length} roles, {result.resume.skills.length} skills
            {result.detectedYearsExperience ? `, about ${Math.floor(result.detectedYearsExperience)} years of experience` : ''}.
          </T>
          {result.warnings.map((w) => (
            <T key={w} variant="caption" color="warning">• {w}</T>
          ))}
        </View>
      ) : null}
    </View>
  );
}
