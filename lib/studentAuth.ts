import { readQuery, writeQuery, getRecordField } from './neo4j';
import { hashPassword, verifyPassword } from './password';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isEmailRegistered(email: string): Promise<boolean> {
  const norm = normalizeEmail(email);
  const recs = await readQuery(
    `MATCH (s:Student {email: $email}) RETURN count(s) AS c`,
    { email: norm }
  );
  const record = recs[0];
  const c = getRecordField(record, 'c');
  return typeof c === 'number' ? c > 0 : Number(c) > 0;
}

export async function authenticateStudent(
  email: string,
  plainPassword: string
): Promise<{ id: string } | null> {
  const norm = normalizeEmail(email);
  const recs = await readQuery(
    `MATCH (s:Student {email: $email}) RETURN s`,
    { email: norm }
  );
  if (!recs.length) return null;

  const record = recs[0];
  const studentNode = getRecordField(record, 's');
  const props = studentNode?.properties as Record<string, unknown> || studentNode as Record<string, unknown>;
  
  const id = props.id as string;
  const salt = props.password_salt as string | undefined;
  const hash = props.password_hash as string | undefined;
  if (!salt || !hash) {
    return null;
  }
  const ok = await verifyPassword(plainPassword, salt, hash);
  if (!ok) return null;

  try {
    await writeQuery(
      `MATCH (s:Student {id: $id}) SET s.last_active = datetime()`,
      { id }
    );
  } catch (err) {
    console.warn('Failed to update last_active:', err);
  }
  return { id };
}
