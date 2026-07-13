// Lightweight Markdown Renderer — no external dependencies
// Supports: headings, bold, italic, lists, tables, blockquotes, code, horizontal rules

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/context';

interface MarkdownViewProps {
  content: string;
}

interface ParsedBlock {
  type: 'heading' | 'table' | 'bullet' | 'blockquote' | 'code' | 'hr' | 'paragraph';
  level?: number; // heading level
  text?: string;
  rows?: string[][]; // table rows
  items?: string[]; // list items
  lines?: string[]; // code lines
}

function parseMarkdown(raw: string): ParsedBlock[] {
  const lines = raw.split('\n');
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) { i++; continue; }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Table (starts with |)
    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      // Parse table
      const rows: string[][] = [];
      for (const tl of tableLines) {
        // Skip separator rows (|---|---|)
        if (/^\|[\s\-:]+\|/.test(tl) && !tl.replace(/[\s\-:|]/g, '')) continue;
        const cells = tl.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) blocks.push({ type: 'table', rows });
      continue;
    }

    // Bullet list
    if (/^[-*•]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const bl = lines[i].trim();
        if (/^[-*•]\s/.test(bl)) {
          items.push(bl.replace(/^[-*•]\s+/, ''));
        } else if (/^\d+\.\s/.test(bl)) {
          items.push(bl.replace(/^\d+\.\s+/, ''));
        } else if (bl === '') {
          break;
        } else {
          // continuation line
          if (items.length > 0) items[items.length - 1] += ' ' + bl;
          else break;
        }
        i++;
      }
      if (items.length > 0) blocks.push({ type: 'bullet', items });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      let quoteText = '';
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteText += lines[i].trim().replace(/^>\s?/, '') + '\n';
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteText.trim() });
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ type: 'code', lines: codeLines });
      continue;
    }

    // Regular paragraph
    let paraText = trimmed;
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || next.startsWith('#') || next.startsWith('|') || next.startsWith('-') ||
          next.startsWith('*') || next.startsWith('>') || next.startsWith('```') ||
          /^\d+\.\s/.test(next)) break;
      paraText += ' ' + next;
      i++;
    }
    blocks.push({ type: 'paragraph', text: paraText });
  }

  return blocks;
}

// Render inline formatting: **bold**, *italic*, `code`
function InlineText({ text, baseStyle }: { text: string; baseStyle: any }) {
  const { colors } = useTheme();
  const parts: React.ReactNode[] = [];
  // Split by **bold**, *italic*, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(<Text key={`t${lastIndex}`} style={baseStyle}>{text.slice(lastIndex, match.index)}</Text>);
    }

    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <Text key={`b${match.index}`} style={[baseStyle, { fontWeight: '700' }]}>
          {token.slice(2, -2)}
        </Text>
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <Text key={`c${match.index}`} style={[baseStyle, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: colors.surfaceContainer, fontSize: 13 }]}>
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.startsWith('*')) {
      parts.push(
        <Text key={`i${match.index}`} style={[baseStyle, { fontStyle: 'italic' }]}>
          {token.slice(1, -1)}
        </Text>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(<Text key={`e${lastIndex}`} style={baseStyle}>{text.slice(lastIndex)}</Text>);
  }

  return parts.length > 0 ? <Text>{parts}</Text> : <Text style={baseStyle}>{text}</Text>;
}

import { Platform } from 'react-native';

export function MarkdownView({ content }: MarkdownViewProps) {
  const { colors, isDark } = useTheme();
  const blocks = parseMarkdown(content);

  return (
    <View>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading': {
            const sizes = [24, 20, 17, 15];
            const size = sizes[Math.min((block.level || 1) - 1, 3)];
            return (
              <Text key={idx} style={{
                fontSize: size, fontWeight: '700', color: colors.text,
                marginTop: idx > 0 ? 16 : 0, marginBottom: 8, letterSpacing: -0.3,
              }}>
                {block.text}
              </Text>
            );
          }

          case 'paragraph':
            return (
              <View key={idx} style={{ marginBottom: 10 }}>
                <InlineText text={block.text || ''} baseStyle={{ fontSize: 14, lineHeight: 22, color: colors.text }} />
              </View>
            );

          case 'bullet':
            return (
              <View key={idx} style={{ marginBottom: 10, paddingLeft: 4 }}>
                {(block.items || []).map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 6, paddingRight: 8 }}>
                    <Text style={{ color: colors.primary, fontSize: 14, marginRight: 8, marginTop: 1 }}>•</Text>
                    <View style={{ flex: 1 }}>
                      <InlineText text={item} baseStyle={{ fontSize: 14, lineHeight: 22, color: colors.text }} />
                    </View>
                  </View>
                ))}
              </View>
            );

          case 'table': {
            const rows = block.rows || [];
            if (rows.length === 0) return null;
            const headerRow = rows[0];
            const dataRows = rows.slice(1);
            return (
              <View key={idx} style={{
                marginVertical: 12, borderRadius: 12, borderWidth: 1,
                borderColor: colors.border, overflow: 'hidden',
              }}>
                {/* Header */}
                <View style={{
                  flexDirection: 'row', backgroundColor: isDark ? 'rgba(196,193,251,0.08)' : '#EEF2FF',
                }}>
                  {headerRow.map((cell, ci) => (
                    <View key={ci} style={{
                      flex: ci === 0 ? 1.2 : 1, padding: 10,
                      borderRightWidth: ci < headerRow.length - 1 ? StyleSheet.hairlineWidth : 0,
                      borderRightColor: colors.border,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.3 }}>
                        {cell}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* Data rows */}
                {dataRows.map((row, ri) => (
                  <View key={ri} style={{
                    flexDirection: 'row',
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                    backgroundColor: ri % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'),
                  }}>
                    {row.map((cell, ci) => (
                      <View key={ci} style={{
                        flex: ci === 0 ? 1.2 : 1, padding: 10,
                        borderRightWidth: ci < row.length - 1 ? StyleSheet.hairlineWidth : 0,
                        borderRightColor: colors.border,
                      }}>
                        <InlineText text={cell} baseStyle={{ fontSize: 13, color: colors.text, lineHeight: 18 }} />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          }

          case 'blockquote':
            return (
              <View key={idx} style={{
                borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 14,
                paddingVertical: 8, marginVertical: 8,
                backgroundColor: isDark ? 'rgba(196,193,251,0.05)' : '#F5F3FF',
                borderRadius: 4,
              }}>
                <Text style={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary, fontStyle: 'italic' }}>
                  {block.text}
                </Text>
              </View>
            );

          case 'code':
            return (
              <View key={idx} style={{
                backgroundColor: isDark ? '#1A1825' : '#F3F4F6', borderRadius: 10,
                padding: 14, marginVertical: 8,
              }}>
                {(block.lines || []).map((ln, li) => (
                  <Text key={li} style={{
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    fontSize: 12, lineHeight: 18, color: colors.text,
                  }}>
                    {ln}
                  </Text>
                ))}
              </View>
            );

          case 'hr':
            return <View key={idx} style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} />;

          default:
            return null;
        }
      })}
    </View>
  );
}
