// Quiz question component (used within QuizPlayScreen)
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/context';

interface QuizQuestionProps {
  question: string;
  options: string[];
  selected: string | null;
  correct: string;
  answered: boolean;
  onSelect: (option: string) => void;
}

export function QuizQuestionComponent({
  question, options, selected, correct, answered, onSelect,
}: QuizQuestionProps) {
  const { colors } = useTheme();

  return (
    <View>
      <Text style={[styles.question, { color: colors.text }]}>{question}</Text>
      {options.map((opt, i) => {
        const isCorrect = opt === correct;
        const isSelected = opt === selected;
        let bg = colors.surface;
        let border = colors.border;

        if (answered) {
          if (isCorrect) { bg = '#179C6E18'; border = '#179C6E'; }
          else if (isSelected) { bg = '#EF444418'; border = '#EF4444'; }
        }

        return (
          <TouchableOpacity
            key={i}
            style={[styles.option, { backgroundColor: bg, borderColor: border }]}
            onPress={() => onSelect(opt)}
            disabled={answered}
          >
            <Text style={[styles.optText, { color: colors.text }]}>{opt}</Text>
            {answered && isCorrect && <Ionicons name="checkmark-circle" size={18} color="#179C6E" />}
            {answered && isSelected && !isCorrect && <Ionicons name="close-circle" size={18} color="#EF4444" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: 18, fontWeight: '500', lineHeight: 28, marginBottom: 20 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  optText: { fontSize: 15, flex: 1 },
});
