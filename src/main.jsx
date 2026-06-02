import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Award, BookOpen, Calendar, CheckCircle2, Edit3, Layers, Library, Plus, Search, Star, Trash2 } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import './styles.css';

const STORAGE_KEY = 'book-log-books';
const TENANT_KEY = 'book-log-tenant';
const DEFAULT_TENANT = 'default';
const statusOptions = ['Read', 'In Progress', 'Want to Read'];
const bookTypeOptions = ['Fiction', 'Non-fiction', 'Realistic Fiction', 'Fantasy', 'Sci-fi', 'Mystery', 'Biography', 'Poetry', 'Historical Fiction', 'Education'];
const defaultForm = {
  title: '',
  author: '',
  status: 'Read',
  rating: '',
  dateFinished: todayDate(),
  notes: '',
  tags: '',
  bookType: 'Fiction',
  seriesName: '',
  seriesNumber: '',
  favorite: false,
  newberyAward: false,
};

function normalizeStatus(status) {
  return status === 'Reading' ? 'In Progress' : status;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseTags(tags) {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseRating(rating) {
  return rating === '' || rating === null || rating === undefined ? null : Number(rating);
}

function addTagToInput(currentTags, tag) {
  const parts = currentTags.split(',');
  const completedTags = parts.slice(0, -1).map((part) => part.trim()).filter(Boolean);
  const tags = [...completedTags];
  const existingTagIndex = tags.findIndex((existingTag) => existingTag.toLowerCase() === tag.toLowerCase());

  if (existingTagIndex === -1) {
    tags.push(tag);
  }

  return tags.join(', ');
}

function titleCase(value) {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function normalizeTenant(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || DEFAULT_TENANT;
}

function getInitialTenant() {
  const params = new URLSearchParams(window.location.search);
  const tenantFromUrl = params.get('tenant');
  const savedTenant = localStorage.getItem(TENANT_KEY);

  return tenantFromUrl || savedTenant ? normalizeTenant(tenantFromUrl || savedTenant) : null;
}

function getStorageKey(tenantId) {
  return `${STORAGE_KEY}-${tenantId}`;
}

const initialBooks = [];

function normalizeBook(book) {
  return {
    ...book,
    status: normalizeStatus(book.status),
    tags: book.tags || [],
    bookType: book.bookType || 'Fiction',
    seriesName: book.seriesName || '',
    seriesNumber: book.seriesNumber || '',
    favorite: Boolean(book.favorite),
    newberyAward: Boolean(book.newberyAward),
  };
}

function loadLocalBooks(tenantId = getInitialTenant()) {
  if (!tenantId) {
    return [];
  }

  const saved = localStorage.getItem(getStorageKey(tenantId));
  let parsedBooks = initialBooks;

  if (saved) {
    try {
      parsedBooks = JSON.parse(saved);
    } catch {
      parsedBooks = initialBooks;
    }
  }

  return parsedBooks.map(normalizeBook);
}

function App() {
  const initialTenant = getInitialTenant();
  const [books, setBooks] = useState(() => loadLocalBooks(initialTenant));
  const [tenantInput, setTenantInput] = useState(initialTenant || '');
  const [tenantId, setTenantId] = useState(initialTenant);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [ratingBookId, setRatingBookId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showTenantPanel, setShowTenantPanel] = useState(false);
  const [addAttempted, setAddAttempted] = useState(false);
  const hasSyncedCloud = useRef(false);

  useEffect(() => {
    if (!tenantId) {
      return;
    }

    localStorage.setItem(getStorageKey(tenantId), JSON.stringify(books));
  }, [books, tenantId]);

  useEffect(() => {
    if (!tenantId) {
      return undefined;
    }

    const booksDoc = doc(db, 'bookLogs', tenantId);

    localStorage.setItem(TENANT_KEY, tenantId);
    hasSyncedCloud.current = false;
    setBooks(loadLocalBooks(tenantId));

    return onSnapshot(booksDoc, (snapshot) => {
      if (snapshot.exists()) {
        const cloudBooks = snapshot.data().books || [];
        hasSyncedCloud.current = true;
        setBooks(cloudBooks.map(normalizeBook));
        return;
      }

      if (!hasSyncedCloud.current) {
        hasSyncedCloud.current = true;
        setDoc(booksDoc, { books: loadLocalBooks(tenantId) });
      }
    });
  }, [tenantId]);

  function saveBooks(updater) {
    if (!tenantId) {
      return;
    }

    setBooks((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      setDoc(doc(db, 'bookLogs', tenantId), { books: next });
      return next;
    });
  }

  const stats = useMemo(() => {
    const read = books.filter((book) => book.status === 'Read');
    const ratedRead = read.filter((book) => book.rating);
    const average = ratedRead.length ? ratedRead.reduce((sum, book) => sum + Number(book.rating), 0) / ratedRead.length : 0;

    return {
      total: books.length,
      read: read.length,
      reading: books.filter((book) => book.status === 'In Progress').length,
      average: average.toFixed(1),
    };
  }, [books]);

  const authors = useMemo(() => {
    return [...new Set(books.map((book) => book.author).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const seriesNames = useMemo(() => {
    return [...new Set(books.map((book) => book.seriesName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const tagNames = useMemo(() => {
    return [...new Set(books.flatMap((book) => book.tags || []))].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const authorSuggestions = useMemo(() => {
    const queryText = form.author.trim().toLowerCase();

    if (!queryText) {
      return [];
    }

    return authors.filter((author) => author.toLowerCase().includes(queryText) && author.toLowerCase() !== queryText).slice(0, 5);
  }, [authors, form.author]);

  const editAuthorSuggestions = useMemo(() => {
    const queryText = editForm?.author.trim().toLowerCase();

    if (!queryText) {
      return [];
    }

    return authors.filter((author) => author.toLowerCase().includes(queryText) && author.toLowerCase() !== queryText).slice(0, 5);
  }, [authors, editForm]);

  const seriesSuggestions = useMemo(() => {
    const queryText = form.seriesName.trim().toLowerCase();

    if (!queryText) {
      return [];
    }

    return seriesNames.filter((seriesName) => seriesName.toLowerCase().includes(queryText) && seriesName.toLowerCase() !== queryText).slice(0, 5);
  }, [seriesNames, form.seriesName]);

  const editSeriesSuggestions = useMemo(() => {
    const queryText = editForm?.seriesName.trim().toLowerCase();

    if (!queryText) {
      return [];
    }

    return seriesNames.filter((seriesName) => seriesName.toLowerCase().includes(queryText) && seriesName.toLowerCase() !== queryText).slice(0, 5);
  }, [seriesNames, editForm]);

  const tagSuggestions = useMemo(() => {
    const tags = parseTags(form.tags);
    const currentTagText = form.tags.split(',').pop().trim().toLowerCase();

    if (!currentTagText) {
      return [];
    }

    return tagNames
      .filter((tag) => tag.toLowerCase().includes(currentTagText) && !tags.includes(tag))
      .slice(0, 5);
  }, [tagNames, form.tags]);

  const editTagSuggestions = useMemo(() => {
    const tags = parseTags(editForm?.tags || '');
    const currentTagText = (editForm?.tags || '').split(',').pop().trim().toLowerCase();

    if (!currentTagText) {
      return [];
    }

    return tagNames
      .filter((tag) => tag.toLowerCase().includes(currentTagText) && !tags.includes(tag))
      .slice(0, 5);
  }, [tagNames, editForm]);

  const isFavorite = Boolean(form.favorite);
  const isEditFavorite = Boolean(editForm?.favorite);
  const canAddBook = Boolean(form.title.trim() && form.author.trim());

  const visibleBooks = useMemo(() => {
    return books
      .filter((book) => filter === 'All' || book.status === filter)
      .filter((book) => !showFavoritesOnly || book.favorite)
      .filter((book) => `${book.title} ${book.author} ${book.bookType} ${book.seriesName} ${book.favorite ? 'favorite' : ''} ${book.notes} ${book.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [books, filter, query, showFavoritesOnly]);

  const tenantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    if (tenantId) {
      url.searchParams.set('tenant', tenantId);
    }
    return url.toString();
  }, [tenantId]);

  function switchTenant(event) {
    event.preventDefault();

    const nextTenant = normalizeTenant(tenantInput);
    const url = new URL(window.location.href);
    url.searchParams.set('tenant', nextTenant);
    window.history.replaceState({}, '', url);
    setTenantInput(nextTenant);
    setTenantId(nextTenant);
    setShowTenantPanel(false);
  }

  async function copyTenantLink() {
    await navigator.clipboard.writeText(tenantUrl);
  }

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: field === 'author' ? titleCase(value) : value };

      if (field === 'status' && value === 'Read' && !current.dateFinished) {
        next.dateFinished = todayDate();
      }

      return next;
    });
  }

  function updateEditForm(field, value) {
    setEditForm((current) => ({ ...current, [field]: field === 'author' ? titleCase(value) : value }));
  }

  function selectAuthor(author) {
    setForm((current) => ({ ...current, author }));
  }

  function selectEditAuthor(author) {
    setEditForm((current) => ({ ...current, author }));
  }

  function selectSeries(seriesName) {
    setForm((current) => ({ ...current, seriesName }));
  }

  function selectEditSeries(seriesName) {
    setEditForm((current) => ({ ...current, seriesName }));
  }

  function addTagSuggestion(tag) {
    setForm((current) => ({ ...current, tags: addTagToInput(current.tags, tag) }));
  }

  function addEditTagSuggestion(tag) {
    setEditForm((current) => ({ ...current, tags: addTagToInput(current.tags, tag) }));
  }

  function toggleFavorite() {
    setForm((current) => ({ ...current, favorite: !current.favorite }));
  }

  function toggleEditFavorite() {
    setEditForm((current) => ({ ...current, favorite: !current.favorite }));
  }

  function addBook(event) {
    event.preventDefault();

    if (!form.title.trim() || !form.author.trim()) {
      setAddAttempted(true);
      return;
    }

    saveBooks((current) => [
      {
        ...form,
        id: crypto.randomUUID(),
        title: form.title.trim(),
        author: titleCase(form.author.trim()),
        rating: form.status === 'Read' ? parseRating(form.rating) : null,
        dateFinished: form.status === 'Read' ? form.dateFinished : '',
        tags: parseTags(form.tags),
        bookType: form.bookType,
        seriesName: form.seriesName.trim(),
        seriesNumber: form.seriesNumber.trim(),
        favorite: Boolean(form.favorite),
        newberyAward: Boolean(form.newberyAward),
      },
      ...current,
    ]);
    setForm((current) => ({
      ...defaultForm,
      status: current.status,
      rating: current.rating,
      bookType: current.bookType,
      dateFinished: current.status === 'Read' ? todayDate() : '',
    }));
    setShowMoreDetails(false);
    setAddAttempted(false);
  }

  function clearForm() {
    setForm(defaultForm);
    setShowMoreDetails(false);
    setAddAttempted(false);
  }

  function deleteBook(id) {
    saveBooks((current) => current.filter((book) => book.id !== id));
  }

  function confirmDeleteBook(book) {
    if (window.confirm(`Delete "${book.title}" from your book log?`)) {
      deleteBook(book.id);
    }
  }

  function startEditing(book) {
    setEditingId(book.id);
    setEditForm({ ...book, tags: book.tags.join(', ') });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(null);
  }

  function saveBookEdit(event) {
    event.preventDefault();

    if (!editForm.title.trim() || !editForm.author.trim()) {
      return;
    }

    saveBooks((current) => current.map((book) => {
      if (book.id !== editingId) {
        return book;
      }

      return {
        ...book,
        ...editForm,
        title: editForm.title.trim(),
        author: titleCase(editForm.author.trim()),
        rating: editForm.status === 'Read' ? parseRating(editForm.rating) : null,
        dateFinished: editForm.status === 'Read' ? editForm.dateFinished : '',
        tags: parseTags(editForm.tags),
        bookType: editForm.bookType,
        seriesName: editForm.seriesName.trim(),
        seriesNumber: editForm.seriesNumber.trim(),
        favorite: Boolean(editForm.favorite),
        newberyAward: Boolean(editForm.newberyAward),
      };
    }));
    cancelEditing();
  }

  function markBookAsRead(id) {
    setRatingBookId(id);
  }

  function finishBook(id, rating = null) {
    saveBooks((current) => current.map((book) => {
      if (book.id !== id) {
        return book;
      }

      return {
        ...book,
        status: 'Read',
        rating,
        dateFinished: book.dateFinished || todayDate(),
      };
    }));
    setRatingBookId(null);
  }

  function markBookInProgress(id) {
    saveBooks((current) => current.map((book) => {
      if (book.id !== id) {
        return book;
      }

      return {
        ...book,
        status: 'In Progress',
        rating: null,
        dateFinished: '',
      };
    }));
  }

  if (!tenantId) {
    return (
      <main className="app-shell">
        <section className="library-gate">
          <p className="eyebrow"><Library size={16} /> Personal Library</p>
          <h1>Create your library</h1>
          <p>Choose a library name to start your book log. You can share the library link later so others open the same collection.</p>
          <form onSubmit={switchTenant}>
            <input value={tenantInput} onChange={(event) => setTenantInput(event.target.value)} placeholder="family-name" autoFocus />
            <button type="submit">Create library</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow"><Library size={16} /> Personal Library</p>
          <h1>Book Log</h1>
          <p className="hero-copy">Track what you read, what you are reading, your ratings, and the notes you want to remember.</p>
        </div>
        <div className="hero-card">
          <BookOpen size={34} />
          <strong>{stats.total}</strong>
          <span>books logged</span>
        </div>
      </section>

      <section className={showTenantPanel ? 'tenant-panel open' : 'tenant-panel'}>
        <button className="tenant-toggle-button" onClick={() => setShowTenantPanel((current) => !current)} type="button">
          Library: {tenantId}
        </button>
        {showTenantPanel && (
          <div className="tenant-controls">
            <form onSubmit={switchTenant}>
              <input value={tenantInput} onChange={(event) => setTenantInput(event.target.value)} placeholder="family-name" />
              <button type="submit">Switch</button>
            </form>
            <button className="copy-link-button" onClick={copyTenantLink} type="button">Copy library link</button>
          </div>
        )}
      </section>

      <section className="stats-grid">
        <Stat icon={<CheckCircle2 />} label="Finished" value={stats.read} />
        <Stat icon={<BookOpen />} label="In progress" value={stats.reading} />
        <Stat icon={<Star />} label="Avg read rating" value={stats.average} />
      </section>

      <section className="panel layout-grid">
        <form className="book-form" onSubmit={addBook} noValidate>
          <div className="form-heading">
            <div>
              <h2>Add a book</h2>
              <p>Title and author are all you need to get started.</p>
            </div>
            <button className="clear-form-button" onClick={clearForm} type="button">Clear</button>
          </div>
          <label>
            Title <span className={form.title.trim() ? 'required-label complete' : 'required-label'}>{form.title.trim() ? 'done' : 'needed'}</span>
            <input
              value={form.title}
              onChange={(event) => updateForm('title', event.target.value)}
              placeholder="Dune"
            />
          </label>
          <label>
            Author <span className={form.author.trim() ? 'required-label complete' : 'required-label'}>{form.author.trim() ? 'done' : 'needed'}</span>
            <input value={form.author} onChange={(event) => updateForm('author', event.target.value)} placeholder="Frank Herbert" />
            {!!authorSuggestions.length && (
              <div className="suggestion-list">
                {authorSuggestions.map((author) => (
                  <button key={author} onClick={() => selectAuthor(author)} type="button">{author}</button>
                ))}
              </div>
            )}
          </label>
          <div className="form-row">
            <label>
              Status
              <select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                {statusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            {form.status === 'Read' && (
              <label>
                Rating
                <select value={form.rating} onChange={(event) => updateForm('rating', event.target.value)}>
                  <option value="">No rating</option>
                  {[5, 4, 3, 2, 1].map((rating) => <option key={rating}>{rating}</option>)}
                </select>
              </label>
            )}
          </div>
          <button className="details-toggle" onClick={() => setShowMoreDetails((current) => !current)} type="button">
            {showMoreDetails ? 'Hide details' : 'More details'}
          </button>
          {showMoreDetails && (
            <div className="optional-details">
              {form.status === 'Read' && (
                <label>
                  Date finished
                  <input type="date" value={form.dateFinished} onChange={(event) => updateForm('dateFinished', event.target.value)} />
                </label>
              )}
              <label>
                Notes
                <textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Favorite quote, big idea, or takeaway" />
              </label>
              <label>
                Tags
                <input value={form.tags} onChange={(event) => updateForm('tags', event.target.value)} placeholder="sci-fi, favorite, short read" />
                {!!tagSuggestions.length && (
                  <div className="suggestion-list">
                    {tagSuggestions.map((tag) => (
                      <button key={tag} onClick={() => addTagSuggestion(tag)} type="button">{tag}</button>
                    ))}
                  </div>
                )}
              </label>
              <button className={isFavorite ? 'favorite-button active' : 'favorite-button'} onClick={toggleFavorite} type="button">
                {isFavorite ? 'Favorite ✓' : 'Mark as favorite'}
              </button>
              <label>
                Book type
                <select value={form.bookType} onChange={(event) => updateForm('bookType', event.target.value)}>
                  {bookTypeOptions.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Series name
                  <input value={form.seriesName} onChange={(event) => updateForm('seriesName', event.target.value)} placeholder="Percy Jackson" />
                  {!!seriesSuggestions.length && (
                    <div className="suggestion-list">
                      {seriesSuggestions.map((seriesName) => (
                        <button key={seriesName} onClick={() => selectSeries(seriesName)} type="button">{seriesName}</button>
                      ))}
                    </div>
                  )}
                </label>
                <label>
                  Book #
                  <input value={form.seriesNumber} onChange={(event) => updateForm('seriesNumber', event.target.value)} placeholder="1" />
                </label>
              </div>
              <label className="toggle-field">
                <input checked={form.newberyAward} onChange={(event) => updateForm('newberyAward', event.target.checked)} type="checkbox" />
                Newbery Award winner
              </label>
            </div>
          )}
          {addAttempted && !canAddBook && <p className="form-helper">Add a title and author to save this book.</p>}
          <button type="submit"><Plus size={18} /> Add book</button>
        </form>

        <div className="book-list-area">
          <div className="toolbar">
            <div className="search-box">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search books" />
            </div>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option>All</option>
              {statusOptions.map((status) => <option key={status}>{status}</option>)}
            </select>
            <button className={showFavoritesOnly ? 'filter-button active' : 'filter-button'} onClick={() => setShowFavoritesOnly((current) => !current)} type="button">
              Favorites
            </button>
          </div>

          <div className="book-list">
            {visibleBooks.map((book) => (
              <article className="book-card" key={book.id}>
                {editingId === book.id ? (
                  <form className="edit-book-form" onSubmit={saveBookEdit}>
                    <div className="form-row">
                      <label>
                        Title
                        <input
                          value={editForm.title}
                          onChange={(event) => updateEditForm('title', event.target.value)}
                        />
                      </label>
                      <label>
                        Author
                        <input value={editForm.author} onChange={(event) => updateEditForm('author', event.target.value)} />
                        {!!editAuthorSuggestions.length && (
                          <div className="suggestion-list">
                            {editAuthorSuggestions.map((author) => (
                              <button key={author} onClick={() => selectEditAuthor(author)} type="button">{author}</button>
                            ))}
                          </div>
                        )}
                      </label>
                    </div>
                    <div className="form-row">
                      <label>
                        Status
                        <select value={editForm.status} onChange={(event) => updateEditForm('status', event.target.value)}>
                          {statusOptions.map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </label>
                      {editForm.status === 'Read' && (
                        <label>
                          Rating
                          <select value={editForm.rating ?? ''} onChange={(event) => updateEditForm('rating', event.target.value)}>
                            <option value="">No rating</option>
                            {[5, 4, 3, 2, 1].map((rating) => <option key={rating}>{rating}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                    {editForm.status === 'Read' && (
                      <label>
                        Date finished
                        <input type="date" value={editForm.dateFinished} onChange={(event) => updateEditForm('dateFinished', event.target.value)} />
                      </label>
                    )}
                    <label>
                      Notes
                      <textarea value={editForm.notes} onChange={(event) => updateEditForm('notes', event.target.value)} />
                    </label>
                    <label>
                      Tags
                      <input value={editForm.tags} onChange={(event) => updateEditForm('tags', event.target.value)} />
                      {!!editTagSuggestions.length && (
                        <div className="suggestion-list">
                          {editTagSuggestions.map((tag) => (
                            <button key={tag} onClick={() => addEditTagSuggestion(tag)} type="button">{tag}</button>
                          ))}
                        </div>
                      )}
                    </label>
                    <button className={isEditFavorite ? 'favorite-button active' : 'favorite-button'} onClick={toggleEditFavorite} type="button">
                      {isEditFavorite ? 'Favorite ✓' : 'Mark as favorite'}
                    </button>
                    <label>
                      Book type
                      <select value={editForm.bookType} onChange={(event) => updateEditForm('bookType', event.target.value)}>
                        {bookTypeOptions.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </label>
                    <div className="form-row">
                      <label>
                        Series name
                        <input value={editForm.seriesName} onChange={(event) => updateEditForm('seriesName', event.target.value)} />
                        {!!editSeriesSuggestions.length && (
                          <div className="suggestion-list">
                            {editSeriesSuggestions.map((seriesName) => (
                              <button key={seriesName} onClick={() => selectEditSeries(seriesName)} type="button">{seriesName}</button>
                            ))}
                          </div>
                        )}
                      </label>
                      <label>
                        Book #
                        <input value={editForm.seriesNumber} onChange={(event) => updateEditForm('seriesNumber', event.target.value)} />
                      </label>
                    </div>
                    <label className="toggle-field">
                      <input checked={editForm.newberyAward} onChange={(event) => updateEditForm('newberyAward', event.target.checked)} type="checkbox" />
                      Newbery Award winner
                    </label>
                    <div className="edit-actions">
                      <button className="book-action-button" type="submit">Save changes</button>
                      <button className="book-action-button secondary" onClick={cancelEditing} type="button">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="book-card-header">
                      <div>
                        <span className="status-pill">{book.status}</span>
                        <h3>{book.title}</h3>
                        <p>by {book.author}</p>
                      </div>
                      <div className="card-icon-actions">
                        <button className="icon-button" onClick={() => startEditing(book)} aria-label={`Edit ${book.title}`}><Edit3 size={18} /></button>
                        <button className="icon-button" onClick={() => confirmDeleteBook(book)} aria-label={`Delete ${book.title}`}><Trash2 size={18} /></button>
                      </div>
                    </div>
                    <div className="book-meta">
                      {book.status === 'Read' && book.rating && <span><Star size={16} /> {book.rating}/5</span>}
                      <span className="type-badge"><BookOpen size={16} /> {book.bookType}</span>
                      {book.seriesName && <span className="series-badge"><Layers size={16} /> {book.seriesName}{book.seriesNumber && ` #${book.seriesNumber}`}</span>}
                      {book.favorite && <span className="favorite-badge"><Star size={16} /> Favorite</span>}
                      {book.status === 'Read' && book.dateFinished && <span><Calendar size={16} /> {book.dateFinished}</span>}
                      {book.newberyAward && <span className="award-badge"><Award size={16} /> Newbery</span>}
                    </div>
                    {!!book.tags.length && (
                      <div className="tag-list">
                        {book.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}
                      </div>
                    )}
                    <div className="book-actions">
                      {book.status === 'Want to Read' && (
                        <button className="book-action-button secondary" onClick={() => markBookInProgress(book.id)} type="button">
                          Start reading
                        </button>
                      )}
                      <button
                        className={book.status === 'Read' ? 'book-action-button complete' : 'book-action-button'}
                        disabled={book.status === 'Read'}
                        onClick={() => markBookAsRead(book.id)}
                        type="button"
                      >
                        {book.status === 'Read' ? 'Finished' : 'Mark as read'}
                      </button>
                    </div>
                    {ratingBookId === book.id && (
                      <div className="rating-panel">
                        <strong>How would you rate it?</strong>
                        <div className="rating-options">
                          {[5, 4, 3, 2, 1].map((rating) => (
                            <button key={rating} onClick={() => finishBook(book.id, rating)} type="button">{rating} stars</button>
                          ))}
                        </div>
                        <button className="skip-rating-button" onClick={() => finishBook(book.id)} type="button">Skip rating</button>
                      </div>
                    )}
                    {book.notes && <p className="notes">{book.notes}</p>}
                  </>
                )}
              </article>
            ))}
            {!visibleBooks.length && (
              <div className="empty-state">
                <p>{showFavoritesOnly ? 'No favorite books yet.' : 'No books match your search yet.'}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="stat-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
