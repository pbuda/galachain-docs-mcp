export const SCHEMA_SQL = `
-- Documentation chunks (guides, tutorials, etc.)
CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    heading_level INTEGER,
    source_url TEXT,
    file_path TEXT,
    -- Searchable text field (lowercase for case-insensitive search)
    search_text TEXT
);

-- Classes/Interfaces from TypeDoc output
CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    extends_clause TEXT,
    implements_clause TEXT,
    decorators TEXT,
    source_url TEXT,
    file_path TEXT,
    -- Searchable text field (lowercase for case-insensitive search)
    search_text TEXT
);

-- Methods, Properties, Constructors
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER REFERENCES classes(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    signature TEXT,
    visibility TEXT,
    is_static INTEGER DEFAULT 0,
    is_async INTEGER DEFAULT 0,
    description TEXT,
    params TEXT,
    returns TEXT,
    decorators TEXT,
    example_code TEXT,
    -- Searchable text field (lowercase for case-insensitive search)
    search_text TEXT
);

-- Create indexes for search and common queries
CREATE INDEX IF NOT EXISTS idx_docs_package ON docs(package);
CREATE INDEX IF NOT EXISTS idx_docs_category ON docs(category);
CREATE INDEX IF NOT EXISTS idx_docs_search ON docs(search_text);
CREATE INDEX IF NOT EXISTS idx_classes_package ON classes(package);
CREATE INDEX IF NOT EXISTS idx_classes_name ON classes(name);
CREATE INDEX IF NOT EXISTS idx_classes_type ON classes(type);
CREATE INDEX IF NOT EXISTS idx_classes_search ON classes(search_text);
CREATE INDEX IF NOT EXISTS idx_members_class_id ON members(class_id);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
CREATE INDEX IF NOT EXISTS idx_members_search ON members(search_text);
`;
