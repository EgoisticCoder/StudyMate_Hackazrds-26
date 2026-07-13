// Image picker button component
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../lib/context';

interface ImagePickerButtonProps {
  onImageSelected: (uri: string, base64: string) => void;
  loading?: boolean;
}

export function ImagePickerButton({ onImageSelected, loading }: ImagePickerButtonProps) {
  const { colors } = useTheme();

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      onImageSelected(result.assets[0].uri, result.assets[0].base64 || '');
    }
  };

  return (
    <TouchableOpacity
      style={[styles.btn, { borderColor: colors.border, backgroundColor: colors.surface }]}
      onPress={pickImage}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Ionicons name="camera-outline" size={32} color={colors.textTertiary} />
          <Text style={[styles.text, { color: colors.textSecondary }]}>Select Photo</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 12,
    padding: 32, alignItems: 'center', gap: 8,
  },
  text: { fontSize: 14, fontWeight: '500' },
});
