import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle,
  PageBreak, ShadingType, Header, Footer, PageNumber,
} from 'docx';
import { saveAs } from 'file-saver';

const ACCENT_HEX = 'E87B35';
const DARK_HEX = '1E1E1E';
const GRAY_HEX = '787878';
const LIGHT_BG = 'F8F8F8';
const WHITE = 'FFFFFF';

const CATEGORY_COLORS_HEX = {
  'Preliminary & General': '6366F1',
  'Setting Out & Survey': '8B5CF6',
  'Clearing & Grubbing': 'A16207',
  'Earthworks': 'D97706',
  'Gravel & Pavement Layers': 'EA580C',
  'Bituminous Works': '4B5563',
  'Concrete Works': '0891B2',
  'Drainage': '0D9488',
  'Structures (Bridges/Culverts)': '1D4ED8',
  'Road Furniture & Safety': '059669',
  'Environmental & Landscaping': '16A34A',
  'Day Works & Variations': '6B7280',
};

function fmtCh(km) {
  if (km == null) return '—';
  const k = Math.floor(km);
  const m = Math.round((km - k) * 1000);
  return `${k}+${String(m).padStart(3, '0')}`;
}

function makeCell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({
      children: [new TextRun({
        text: String(text ?? '—'),
        bold: opts.bold || false,
        size: opts.size || 18,
        color: opts.color || DARK_HEX,
        font: 'Calibri',
      })],
      alignment: opts.align || AlignmentType.LEFT,
    })],
  });
}

function headerCell(text, width) {
  return makeCell(text, { bold: true, color: WHITE, shading: ACCENT_HEX, width, size: 18 });
}

function spacer() {
  return new Paragraph({ spacing: { after: 200 }, children: [] });
}

// Parse activity name and category from the notes field
function parseEntry(entry) {
  const notes = entry.notes || '';
  const actMatch = notes.match(/^([^[\]—]+?)(?:\s*\[([^\]]+)\])?(?:\s*\|.*?)?(?:\s*—\s*(.*))?$/);
  return {
    activity: actMatch?.[1]?.trim() || notes.split(' — ')[0] || 'Activity',
    category: actMatch?.[2] || '',
    extraNotes: actMatch?.[3] || '',
  };
}

/**
 * Generate a Word document for Work Activities daily log.
 *
 * @param {Object} params
 * @param {Object} params.project       - { name, contract_number, employer, contractor, consultant }
 * @param {Array}  params.entries       - works_progress rows with reporter join
 * @param {string} [params.filterDate]  - if filtering to a single date
 */
export async function generateWorksDocx({ project, entries, filterDate }) {
  const p = project || {};
  const now = new Date();
  const reportTitle = filterDate
    ? `Work Activities — ${filterDate}`
    : 'Work Activities Daily Log';

  // Group entries by date
  const grouped = {};
  entries.forEach(e => {
    const d = e.work_date || 'Unknown';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(e);
  });
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // ═══════════════════════════════════════
  // COVER / HEADER SECTION
  // ═══════════════════════════════════════
  const coverChildren = [
    new Paragraph({ spacing: { before: 1200 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: reportTitle.toUpperCase(), bold: true, size: 40, color: ACCENT_HEX, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: p.name || 'Project', bold: true, size: 30, color: DARK_HEX, font: 'Calibri' })],
    }),
    spacer(),
  ];

  // Project info table
  const infoRows = [
    ['Contract No.', p.contract_number || '—'],
    ['Employer', p.employer || 'Kenya National Highways Authority (KeNHA)'],
    ['Engineer', p.consultant || '—'],
    ['Contractor', p.contractor || '—'],
    ['Report Generated', now.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
    ['Entries', `${entries.length} activities across ${sortedDates.length} day(s)`],
  ];

  const infoColWidths = [3000, 6000];
  coverChildren.push(
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: infoColWidths,
      rows: infoRows.map((row, ri) =>
        new TableRow({
          children: [
            makeCell(row[0], { bold: true, color: GRAY_HEX, width: infoColWidths[0], shading: ri % 2 === 0 ? LIGHT_BG : undefined }),
            makeCell(row[1], { width: infoColWidths[1], shading: ri % 2 === 0 ? LIGHT_BG : undefined }),
          ],
        })
      ),
    }),
    spacer(),
  );

  // ═══════════════════════════════════════
  // DAILY ACTIVITY TABLES
  // ═══════════════════════════════════════
  const contentChildren = [];

  // Summary stats
  const totalKm = entries.reduce((s, e) => s + (e.quantity > 0 ? Number(e.quantity) : 0), 0);
  contentChildren.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: 'Summary', bold: true, size: 26, color: ACCENT_HEX, font: 'Calibri' })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({
        text: `Total activities logged: ${entries.length}  |  Days covered: ${sortedDates.length}  |  Total linear progress: ${totalKm.toFixed(3)} Km`,
        size: 20, color: GRAY_HEX, font: 'Calibri',
      })],
    }),
    spacer(),
  );

  const colWidths = [2800, 1200, 1200, 800, 1200, 1800];

  for (const date of sortedDates) {
    const dayEntries = grouped[date];

    // Group by category
    const byCat = {};
    dayEntries.forEach(e => {
      const pe = parseEntry(e);
      const cat = pe.category || 'Other';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push({ ...e, ...pe });
    });

    // Date heading
    contentChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
        children: [
          new TextRun({ text: `${date}`, bold: true, size: 24, color: ACCENT_HEX, font: 'Calibri' }),
          new TextRun({ text: `   (${dayEntries.length} ${dayEntries.length === 1 ? 'activity' : 'activities'})`, size: 20, color: GRAY_HEX, font: 'Calibri' }),
        ],
      }),
    );

    // Table header row
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        headerCell('Activity', colWidths[0]),
        headerCell('From Ch.', colWidths[1]),
        headerCell('To Ch.', colWidths[2]),
        headerCell('Side', colWidths[3]),
        headerCell('Qty (Km)', colWidths[4]),
        headerCell('Notes / Reporter', colWidths[5]),
      ],
    });

    const dataRows = [];
    let rowIdx = 0;

    for (const [cat, catEntries] of Object.entries(byCat)) {
      // Category sub-header row
      const catColor = CATEGORY_COLORS_HEX[cat] || GRAY_HEX;
      dataRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 6,
              width: { size: 9000, type: WidthType.DXA },
              shading: { fill: catColor, type: ShadingType.CLEAR },
              children: [new Paragraph({
                children: [new TextRun({
                  text: cat.toUpperCase(),
                  bold: true, size: 16, color: WHITE, font: 'Calibri',
                })],
              })],
            }),
          ],
        })
      );

      for (const e of catEntries) {
        const bg = rowIdx % 2 === 1 ? LIGHT_BG : undefined;
        dataRows.push(
          new TableRow({
            children: [
              makeCell(e.activity, { width: colWidths[0], shading: bg, bold: true }),
              makeCell(fmtCh(e.start_chainage), { width: colWidths[1], shading: bg, align: AlignmentType.CENTER }),
              makeCell(fmtCh(e.end_chainage), { width: colWidths[2], shading: bg, align: AlignmentType.CENTER }),
              makeCell(e.side || 'Both', { width: colWidths[3], shading: bg, align: AlignmentType.CENTER }),
              makeCell(e.quantity > 0 ? Number(e.quantity).toFixed(3) : '—', { width: colWidths[4], shading: bg, align: AlignmentType.RIGHT }),
              makeCell(
                [e.extraNotes, e.reporter?.full_name].filter(Boolean).join(' — ') || '—',
                { width: colWidths[5], shading: bg, size: 16, color: GRAY_HEX }
              ),
            ],
          })
        );
        rowIdx++;
      }
    }

    contentChildren.push(
      new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: colWidths,
        rows: [headerRow, ...dataRows],
      }),
    );

    // Day total
    const dayKm = dayEntries.reduce((s, e) => s + (e.quantity > 0 ? Number(e.quantity) : 0), 0);
    contentChildren.push(
      new Paragraph({
        spacing: { before: 60, after: 200 },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({
          text: `Day total: ${dayKm.toFixed(3)} Km`,
          bold: true, size: 18, color: ACCENT_HEX, font: 'Calibri', italics: true,
        })],
      }),
    );
  }

  // ═══════════════════════════════════════
  // BUILD DOCUMENT
  // ═══════════════════════════════════════
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: DARK_HEX } },
      },
    },
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({
                text: `${p.name || 'Project'} — Work Activities Log`,
                size: 16, color: GRAY_HEX, italics: true, font: 'Calibri',
              })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'RoadSite Reports  |  Page ', size: 16, color: GRAY_HEX, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRAY_HEX }),
                new TextRun({ text: ' of ', size: 16, color: GRAY_HEX, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GRAY_HEX }),
              ],
            })],
          }),
        },
        children: [...coverChildren, new Paragraph({ children: [new PageBreak()] }), ...contentChildren],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = (p.name || 'Project').replace(/\s+/g, '_');
  const dateTag = filterDate || now.toISOString().split('T')[0];
  const fileName = `Works_Activities_${safeName}_${dateTag}.docx`;
  saveAs(blob, fileName);
  return fileName;
}
