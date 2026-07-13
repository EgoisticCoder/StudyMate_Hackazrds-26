import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface Note {
  id: string;
  subject: string;
  chapter: string;
  image_uri?: string;
  transcription: string;
  created_at: string;
  updated_at: string;
  synced: boolean;
}

const DB_FILENAME = 'studymate_notes.json';
const DB_PATH = FileSystem.documentDirectory + DB_FILENAME;

// Helper to load notes database
const loadDB = async (): Promise<Note[]> => {
  if (Platform.OS === 'web') {
    try {
      const data = localStorage.getItem('studymate_notes');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error reading localStorage', e);
      return [];
    }
  }

  try {
    const info = await FileSystem.getInfoAsync(DB_PATH);
    if (!info.exists) {
      await FileSystem.writeAsStringAsync(DB_PATH, JSON.stringify([]));
      return [];
    }
    const content = await FileSystem.readAsStringAsync(DB_PATH);
    return JSON.parse(content);
  } catch (e) {
    console.error('Error loading local notes DB', e);
    return [];
  }
};

// Helper to save notes database
const saveDB = async (notes: Note[]): Promise<void> => {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem('studymate_notes', JSON.stringify(notes));
    } catch (e) {
      console.error('Error writing localStorage', e);
    }
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(DB_PATH, JSON.stringify(notes));
  } catch (e) {
    console.error('Error saving local notes DB', e);
  }
};

export const saveNote = async (note: Omit<Note, 'created_at' | 'updated_at' | 'synced'>): Promise<Note> => {
  const db = await loadDB();
  const now = new Date().toISOString();
  
  // Handle image copy for native platform to persist it permanently
  let finalImageUri = note.image_uri;
  if (note.image_uri && Platform.OS !== 'web' && !note.image_uri.startsWith('file:///')) {
    try {
      const filename = note.image_uri.split('/').pop() || `note_${Date.now()}.jpg`;
      const newPath = FileSystem.documentDirectory + filename;
      await FileSystem.copyAsync({
        from: note.image_uri,
        to: newPath
      });
      finalImageUri = newPath;
    } catch (e) {
      console.error('Error copying image to permanent storage', e);
    }
  }

  const newNote: Note = {
    ...note,
    image_uri: finalImageUri,
    created_at: now,
    updated_at: now,
    synced: false
  };

  db.push(newNote);
  await saveDB(db);
  return newNote;
};

export const getNotes = async (): Promise<Note[]> => {
  return await loadDB();
};

export const getNote = async (id: string): Promise<Note | undefined> => {
  const db = await loadDB();
  return db.find(n => n.id === id);
};

export const updateNote = async (id: string, updates: Partial<Note>): Promise<Note | undefined> => {
  const db = await loadDB();
  const index = db.findIndex(n => n.id === id);
  if (index === -1) return undefined;

  const updatedNote: Note = {
    ...db[index],
    ...updates,
    updated_at: new Date().toISOString(),
    synced: false
  };

  db[index] = updatedNote;
  await saveDB(db);
  return updatedNote;
};

export const deleteNote = async (id: string): Promise<boolean> => {
  const db = await loadDB();
  const index = db.findIndex(n => n.id === id);
  if (index === -1) return false;

  const note = db[index];
  // Delete image if exists on native filesystem
  if (note.image_uri && Platform.OS !== 'web' && note.image_uri.startsWith('file:///')) {
    try {
      await FileSystem.deleteAsync(note.image_uri, { idempotent: true });
    } catch (e) {
      console.error('Error deleting image file', e);
    }
  }

  db.splice(index, 1);
  await saveDB(db);
  return true;
};

export const searchNotes = async (query: string): Promise<Note[]> => {
  const db = await loadDB();
  const q = query.toLowerCase();
  return db.filter(n => 
    n.subject.toLowerCase().includes(q) ||
    n.chapter.toLowerCase().includes(q) ||
    n.transcription.toLowerCase().includes(q)
  );
};
