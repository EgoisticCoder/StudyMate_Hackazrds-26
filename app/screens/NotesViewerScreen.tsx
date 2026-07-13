import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, Alert, Platform, Modal, Share
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../../lib/context';
import { getNotes, deleteNote, Note, searchNotes } from '../../lib/notesDB';
import { SUBJECTS } from '../../constants/subjects';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { Chip, SurfaceCard, SectionLabel, AnimatedScreenWrapper } from '../../components/ui/premium';
import { useTranslateSubject } from '../../lib/translations';

export default function NotesViewerScreen() {
  const { colors, isDark } = useTheme();
  const translateSubject = useTranslateSubject();
  
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Detail Modal State
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      let data: Note[];
      if (searchQuery.trim()) {
        data = await searchNotes(searchQuery);
      } else {
        data = await getNotes();
      }

      // Filter by subject if selected
      if (selectedSubject) {
        data = data.filter(n => n.subject === selectedSubject);
      }

      // Sort by date desc
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setNotes(data);
    } catch (e) {
      console.error('Failed to load notes', e);
    } finally {
      setLoading(false);
    }
  };

  // Reload notes when screen gains focus or search/filter changes
  useFocusEffect(
    React.useCallback(() => {
      fetchNotes();
    }, [searchQuery, selectedSubject])
  );

  const handleDelete = (noteId: string) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to permanently delete this study note?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(noteId);
              if (selectedNote?.id === noteId) {
                setSelectedNote(null);
              }
              fetchNotes();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete note.');
            }
          }
        }
      ]
    );
  };

  const handleShare = async (note: Note) => {
    try {
      await Share.share({
        title: `${note.subject} - ${note.chapter}`,
        message: `${note.subject} (${note.chapter}) Notes:\n\n${note.transcription}`,
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.headerArea}>
        <TouchableOpacity 
          onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}} 
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          My Study Notes
        </Text>
        <TouchableOpacity 
          onPress={() => router.push('/screens/NotesUploadScreen' as any)} 
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="add" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary, fontFamily: Fonts.body }]}
            placeholder="Search notes content, chapters, subjects..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Subject Filter Chips */}
      <View style={{ maxHeight: 44, marginBottom: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <Chip
            label="All Subjects"
            selected={selectedSubject === ''}
            onPress={() => setSelectedSubject('')}
          />
          {SUBJECTS.map(s => (
            <Chip
              key={s.name}
              label={s.name}
              selected={selectedSubject === s.name}
              onPress={() => setSelectedSubject(s.name)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Notes List */}
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
        ) : notes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
              No study notes found
            </Text>
            <Text style={[styles.emptySub, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
              {searchQuery || selectedSubject 
                ? 'Try clearing your filters or search query.' 
                : 'Upload your handwritten answer sheets or notes to start organizing.'}
            </Text>
            {!searchQuery && !selectedSubject && (
              <TouchableOpacity 
                style={[styles.createBtn, { backgroundColor: colors.accent }]}
                onPress={() => router.push('/screens/NotesUploadScreen' as any)}
              >
                <Text style={{ color: colors.textInverse, fontFamily: Fonts.display, fontSize: 14 }}>
                  Upload Note
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          notes.map((note, index) => (
            <SurfaceCard 
              key={note.id}
              delay={index * 50}
              onPress={() => setSelectedNote(note)}
              style={styles.card}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.cardSubject, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
                    {translateSubject(note.subject).toUpperCase()}
                  </Text>
                  <Text style={[styles.cardChapter, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                    {note.chapter}
                  </Text>
                </View>
                {note.image_uri && (
                  <Ionicons name="image-outline" size={16} color={colors.textSecondary} />
                )}
              </View>

              <Text 
                numberOfLines={3} 
                style={[styles.cardPreview, { color: colors.textSecondary, fontFamily: Fonts.body }]}
              >
                {note.transcription.replace(/#+\s/g, '').replace(/\n+/g, ' ')}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={[styles.cardDate, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                  {new Date(note.created_at).toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={() => handleShare(note)}>
                    <Ionicons name="share-social-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(note.id)}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </SurfaceCard>
          ))
        )}
      </ScrollView>

      {/* Note Detail Modal */}
      <Modal
        visible={selectedNote !== null}
        animationType="slide"
        onRequestClose={() => setSelectedNote(null)}
      >
        {selectedNote && (
          <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderSubtle }]}>
              <TouchableOpacity 
                onPress={() => setSelectedNote(null)}
                style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
              >
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[styles.modalSubject, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
                  {translateSubject(selectedNote.subject).toUpperCase()}
                </Text>
                <Text numberOfLines={1} style={[styles.modalChapter, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                  {selectedNote.chapter}
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => handleShare(selectedNote)}
                style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
              >
                <Ionicons name="share-social-outline" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Modal Content */}
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalContent}
            >
              {selectedNote.image_uri && (
                <View style={[styles.modalImageContainer, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                  <Image source={{ uri: selectedNote.image_uri }} style={styles.modalImage} resizeMode="contain" />
                </View>
              )}

              <SectionLabel text="NOTE TRANSCRIPTION" style={{ marginBottom: 12 }} />
              
              <View style={[styles.markdownContainer, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
                <Markdown
                  style={{
                    body: { color: colors.textPrimary, fontFamily: Fonts.body, fontSize: 15, lineHeight: 24 },
                    heading1: { color: colors.textPrimary, fontFamily: Fonts.display, fontSize: 20, marginTop: 12, marginBottom: 8 },
                    heading2: { color: colors.textPrimary, fontFamily: Fonts.display, fontSize: 18, marginTop: 10, marginBottom: 6 },
                    bullet_list: { marginTop: 4, marginBottom: 4 },
                    ordered_list: { marginTop: 4, marginBottom: 4 },
                  }}
                >
                  {selectedNote.transcription}
                </Markdown>
              </View>
            </ScrollView>

            {/* AI Tools Bar */}
            <View style={[styles.toolsBar, { backgroundColor: colors.surface2, borderTopColor: colors.borderSubtle }]}>
              <TouchableOpacity 
                style={[styles.toolBtn, { backgroundColor: colors.accent }]}
                onPress={() => {
                  setSelectedNote(null);
                  router.push({
                    pathname: '/screens/NotesRAGScreen' as any,
                    params: { noteId: selectedNote.id, noteText: selectedNote.transcription }
                  });
                }}
              >
                <Ionicons name="chatbubbles-outline" size={18} color={colors.textInverse} />
                <Text style={[styles.toolText, { color: colors.textInverse, fontFamily: Fonts.bodyMedium }]}>
                  Ask Note
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.toolBtn, { backgroundColor: colors.surface3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle }]}
                onPress={() => {
                  setSelectedNote(null);
                  router.push({
                    pathname: '/screens/MindMapScreen' as any,
                    params: { noteId: selectedNote.id, noteText: selectedNote.transcription, title: selectedNote.chapter }
                  });
                }}
              >
                <Ionicons name="git-network-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.toolText, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                  Mind Map
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.toolBtn, { backgroundColor: colors.surface3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle }]}
                onPress={() => {
                  setSelectedNote(null);
                  router.push({
                    pathname: '/screens/FlashcardsScreen' as any,
                    params: { noteId: selectedNote.id, noteText: selectedNote.transcription, title: selectedNote.chapter }
                  });
                }}
              >
                <Ionicons name="copy-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.toolText, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                  Flashcards
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  headerArea: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    marginBottom: 16 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, letterSpacing: -0.4 },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: Radii.input,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    marginLeft: 8,
    fontSize: 14,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 4,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardSubject: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cardChapter: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  cardPreview: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 8,
  },
  cardDate: {
    fontSize: 11,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 30,
    lineHeight: 18,
  },
  createBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radii.button,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalSubject: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  modalChapter: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
    maxWidth: 220,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  modalImageContainer: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modalImage: {
    width: '100%',
    height: 350,
  },
  markdownContainer: {
    padding: 16,
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: Radii.button,
    marginHorizontal: 4,
    gap: 8,
  },
  toolText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
