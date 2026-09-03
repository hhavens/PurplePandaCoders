import os
import sys
import sqlite3
import zipfile
from dataclasses import dataclass
from datetime import datetime

from PIL import Image
from PySide6.QtCore import Qt, QAbstractTableModel, QModelIndex
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QSplitter, QTreeWidget, QTreeWidgetItem,
    QTableView, QLabel, QVBoxLayout, QHBoxLayout, QPushButton, QFileDialog, QMessageBox
)

DB_PATH = os.path.expanduser("~/Library/Application Support/PyComicRack/library.sqlite3")
COVER_CACHE_DIR = os.path.expanduser("~/Library/Caches/PyComicRack/covers")

SUPPORTED_EXTS = {".cbz", ".pdf"}  # add ".cbr" later

def ensure_dirs():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(COVER_CACHE_DIR, exist_ok=True)

def connect_db():
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS comics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            series TEXT,
            issue TEXT,
            publisher TEXT,
            path TEXT UNIQUE,
            ext TEXT,
            added_at TEXT,
            cover_path TEXT
        )
    """)
    conn.commit()
    return conn

def first_image_from_cbz(cbz_path: str) -> str | None:
    """
    Extract first image from CBZ into cover cache. Returns cover file path or None.
    """
    try:
        with zipfile.ZipFile(cbz_path, "r") as z:
            # Sort files to get something like 001.jpg first
            names = sorted(
                [n for n in z.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
            )
            if not names:
                return None

            first = names[0]
            # stable cache name
            base = os.path.basename(cbz_path)
            safe = "".join(c for c in base if c.isalnum() or c in (" ", "-", "_", ".")).strip()
            out_path = os.path.join(COVER_CACHE_DIR, safe + ".cover.jpg")

            if os.path.exists(out_path):
                return out_path

            data = z.read(first)
            # Convert to JPEG for consistent preview
            from io import BytesIO
            img = Image.open(BytesIO(data)).convert("RGB")
            img.thumbnail((512, 512))
            img.save(out_path, "JPEG", quality=85)
            return out_path
    except Exception:
        return None

def guess_metadata_from_filename(path: str) -> tuple[str, str, str]:
    """
    Very basic guess: "Series - 001 - Title.cbz" or "Series 001.cbz".
    Returns (series, issue, title).
    """
    name = os.path.splitext(os.path.basename(path))[0]
    # quick heuristics
    parts = [p.strip() for p in name.replace("_", " ").split("-")]
    if len(parts) >= 3:
        series = parts[0]
        issue = parts[1]
        title = "-".join(parts[2:]).strip()
        return series, issue, title
    # try last token as issue
    tokens = name.split()
    if tokens and tokens[-1].isdigit():
        issue = tokens[-1]
        series = " ".join(tokens[:-1]).strip()
        return series or name, issue, name
    return name, "", name

def scan_folder(folder: str) -> list[str]:
    found = []
    for root, _, files in os.walk(folder):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in SUPPORTED_EXTS:
                found.append(os.path.join(root, f))
    return found

@dataclass
class ComicRow:
    id: int
    title: str
    series: str
    issue: str
    publisher: str
    path: str
    ext: str
    added_at: str
    cover_path: str | None

class ComicsTableModel(QAbstractTableModel):
    HEADERS = ["Title", "Series", "Issue", "Publisher", "Format", "Path", "Added"]

    def __init__(self):
        super().__init__()
        self.rows: list[ComicRow] = []

    def rowCount(self, parent=QModelIndex()) -> int:
        return len(self.rows)

    def columnCount(self, parent=QModelIndex()) -> int:
        return len(self.HEADERS)

    def headerData(self, section, orientation, role=Qt.DisplayRole):
        if role != Qt.DisplayRole:
            return None
        if orientation == Qt.Horizontal:
            return self.HEADERS[section]
        return str(section + 1)

    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid():
            return None
        r = self.rows[index.row()]
        c = index.column()

        if role == Qt.DisplayRole:
            return [
                r.title, r.series, r.issue, r.publisher, r.ext.upper(), r.path, r.added_at
            ][c]
        return None

    def set_rows(self, rows: list[ComicRow]):
        self.beginResetModel()
        self.rows = rows
        self.endResetModel()

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("PyComicRack (Starter)")
        self.conn = connect_db()

        # Sidebar
        self.tree = QTreeWidget()
        self.tree.setHeaderHidden(True)

        lib_item = QTreeWidgetItem(["Library"])
        all_item = QTreeWidgetItem(["All Comics"])
        lib_item.addChild(all_item)
        self.tree.addTopLevelItem(lib_item)
        lib_item.setExpanded(True)

        # Table
        self.model = ComicsTableModel()
        self.table = QTableView()
        self.table.setModel(self.model)
        self.table.setSelectionBehavior(QTableView.SelectRows)
        self.table.setSelectionMode(QTableView.SingleSelection)
        self.table.setSortingEnabled(False)
        self.table.clicked.connect(self.on_row_selected)

        # Preview pane
        self.cover = QLabel("No cover")
        self.cover.setAlignment(Qt.AlignCenter)
        self.cover.setMinimumWidth(240)

        self.meta = QLabel("")
        self.meta.setWordWrap(True)

        preview_layout = QVBoxLayout()
        preview_layout.addWidget(self.cover, 3)
        preview_layout.addWidget(self.meta, 1)
        preview_widget = QWidget()
        preview_widget.setLayout(preview_layout)

        # Controls
        import_btn = QPushButton("Import Folder…")
        import_btn.clicked.connect(self.import_folder)

        top_bar = QHBoxLayout()
        top_bar.addWidget(import_btn)
        top_bar.addStretch(1)
        top_bar_widget = QWidget()
        top_bar_widget.setLayout(top_bar)

        # Splitter layout
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(self.tree)

        main_split = QSplitter(Qt.Horizontal)
        main_split.addWidget(self.table)
        main_split.addWidget(preview_widget)
        main_split.setStretchFactor(0, 3)
        main_split.setStretchFactor(1, 1)

        center = QWidget()
        center_layout = QVBoxLayout()
        center_layout.addWidget(top_bar_widget)
        center_layout.addWidget(main_split)
        center.setLayout(center_layout)

        splitter.addWidget(center)
        splitter.setStretchFactor(1, 1)

        self.setCentralWidget(splitter)

        self.reload()

    def reload(self):
        cur = self.conn.execute("""
            SELECT id, title, series, issue, publisher, path, ext, added_at, cover_path
            FROM comics
            ORDER BY datetime(added_at) DESC
        """)
        rows = [
            ComicRow(
                id=r[0], title=r[1] or "", series=r[2] or "", issue=r[3] or "",
                publisher=r[4] or "", path=r[5], ext=r[6] or "", added_at=r[7] or "",
                cover_path=r[8]
            )
            for r in cur.fetchall()
        ]
        self.model.set_rows(rows)
        self.cover.setText("No cover")
        self.cover.setPixmap(QPixmap())
        self.meta.setText("")

    def import_folder(self):
        folder = QFileDialog.getExistingDirectory(self, "Choose comics folder")
        if not folder:
            return

        files = scan_folder(folder)
        if not files:
            QMessageBox.information(self, "Import", "No .cbz/.pdf found in that folder.")
            return

        added = 0
        for path in files:
            ext = os.path.splitext(path)[1].lower()
            series, issue, title = guess_metadata_from_filename(path)
            cover_path = None
            if ext == ".cbz":
                cover_path = first_image_from_cbz(path)

            try:
                self.conn.execute("""
                    INSERT OR IGNORE INTO comics (title, series, issue, publisher, path, ext, added_at, cover_path)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    title, series, issue, "", path, ext.lstrip("."), datetime.now().isoformat(timespec="seconds"), cover_path
                ))
                if self.conn.total_changes > 0:
                    added += 1
            except Exception:
                # ignore bad files
                pass

        self.conn.commit()
        QMessageBox.information(self, "Import", f"Imported {added} new comics.")
        self.reload()

    def on_row_selected(self, index: QModelIndex):
        row = self.model.rows[index.row()]
        self.meta.setText(
            f"<b>{row.title}</b><br/>"
            f"Series: {row.series}<br/>"
            f"Issue: {row.issue}<br/>"
            f"Publisher: {row.publisher}<br/>"
            f"Format: {row.ext.upper()}<br/>"
            f"Path: {row.path}"
        )
        if row.cover_path and os.path.exists(row.cover_path):
            pix = QPixmap(row.cover_path)
            if not pix.isNull():
                self.cover.setPixmap(pix.scaled(260, 360, Qt.KeepAspectRatio, Qt.SmoothTransformation))
                self.cover.setText("")
                return
        self.cover.setPixmap(QPixmap())
        self.cover.setText("No cover")

def main():
    app = QApplication(sys.argv)
    w = MainWindow()
    w.resize(1200, 720)
    w.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
