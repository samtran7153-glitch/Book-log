import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, Award, BookOpen, Calendar, CheckCircle2, Copy, Edit3, Layers, Library, Plus, Search, Star, Trash2, Target, TrendingUp, BarChart3, User, Heart } from 'lucide-react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import './styles.css';

const STORAGE_KEY = 'book-log-books';
const TENANT_KEY = 'book-log-tenant';
const GOALS_KEY = 'book-log-goals';
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
  pages: '',
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

function normalizeLibraryName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function getGoalsKey(tenantId) {
  return `${GOALS_KEY}-${tenantId}`;
}

function loadGoals(tenantId) {
  if (!tenantId) {
    return { yearlyGoal: 0 };
  }

  const saved = localStorage.getItem(getGoalsKey(tenantId));
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return { yearlyGoal: 0 };
    }
  }

  return { yearlyGoal: 0 };
}

function getBooksDoc(tenantId) {
  return doc(db, 'bookLogs', tenantId);
}

function getBooksCollection(tenantId) {
  return collection(db, 'bookLogs', tenantId, 'books');
}

function getBookDoc(tenantId, bookId) {
  return doc(db, 'bookLogs', tenantId, 'books', bookId);
}

function setTenantUrl(tenantId) {
  const url = new URL(window.location.href);

  if (tenantId) {
    url.searchParams.set('tenant', tenantId);
  } else {
    url.searchParams.delete('tenant');
  }

  window.history.replaceState({}, '', url);
}

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
    pages: book.pages || '',
  };
}

function renderStars(rating) {
  const value = Number(rating);

  if (!value) {
    return '';
  }

  return '★'.repeat(value) + '☆'.repeat(5 - value);
}

function formatBookShareText(book) {
  const lines = [
    `${book.title} by ${book.author}`,
    `Status: ${book.status}`,
  ];

  if (book.status === 'Read' && book.rating) {
    lines.push(`Rating: ${renderStars(book.rating)} (${book.rating}/5)`);
  }

  if (book.bookType) {
    lines.push(`Type: ${book.bookType}`);
  }

  if (book.seriesName) {
    lines.push(`Series: ${book.seriesName}${book.seriesNumber ? ` #${book.seriesNumber}` : ''}`);
  }

  if (book.tags.length) {
    lines.push(`Tags: ${book.tags.join(', ')}`);
  }

  if (book.notes) {
    lines.push(`Notes: ${book.notes}`);
  }

  return lines.join('\n');
}

function loadLocalBooks(tenantId = getInitialTenant()) {
  if (!tenantId) {
    return [];
  }

  const saved = localStorage.getItem(getStorageKey(tenantId));
  let parsedBooks = [];

  if (saved) {
    try {
      parsedBooks = JSON.parse(saved);
    } catch {
      parsedBooks = [];
    }
  }

  return parsedBooks.map(normalizeBook);
}

function App() {
  const initialTenant = getInitialTenant();
  const [books, setBooks] = useState(() => loadLocalBooks(initialTenant));
  const [tenantInput, setTenantInput] = useState(initialTenant || '');
  const [tenantPasswordInput, setTenantPasswordInput] = useState('');
  const [renameInput, setRenameInput] = useState(initialTenant || '');
  const [libraryError, setLibraryError] = useState('');
  const [libraryMode, setLibraryMode] = useState(initialTenant ? 'signIn' : 'create');
  const [accessGranted, setAccessGranted] = useState(!initialTenant);
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
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isSavingBooks, setIsSavingBooks] = useState(false);
  const [copiedBookId, setCopiedBookId] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showAuthorPanel, setShowAuthorPanel] = useState(false);
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [yearlyGoal, setYearlyGoal] = useState(() => loadGoals(initialTenant).yearlyGoal);
  const [goalInput, setGoalInput] = useState('');
  const hasSyncedCloud = useRef(false);
  const hasSubcollectionBooks = useRef(false);

  useEffect(() => {
    if (!tenantId || !accessGranted) {
      return;
    }

    localStorage.setItem(getStorageKey(tenantId), JSON.stringify(books));
  }, [accessGranted, books, tenantId]);

  useEffect(() => {
    if (!tenantId || !accessGranted) {
      return;
    }

    localStorage.setItem(getGoalsKey(tenantId), JSON.stringify({ yearlyGoal }));
  }, [accessGranted, yearlyGoal, tenantId]);

  useEffect(() => {
    if (!tenantId || !accessGranted) {
      return undefined;
    }

    const booksDoc = getBooksDoc(tenantId);
    const booksCollection = getBooksCollection(tenantId);

    localStorage.setItem(TENANT_KEY, tenantId);
    hasSyncedCloud.current = false;
    hasSubcollectionBooks.current = false;
    setBooks(loadLocalBooks(tenantId));

    const unsubscribeBooks = onSnapshot(booksCollection, (snapshot) => {
      if (snapshot.empty) {
        return;
      }

      hasSyncedCloud.current = true;
      hasSubcollectionBooks.current = true;
      setBooks(snapshot.docs.map((bookSnapshot) => normalizeBook({ id: bookSnapshot.id, ...bookSnapshot.data() })));
      setSaveError('');
    }, () => {
      setSaveError('Could not sync with the cloud. Check your connection and try again.');
    });

    const unsubscribeLibrary = onSnapshot(booksDoc, (snapshot) => {
      if (snapshot.exists()) {
        const cloudBooks = snapshot.data().books || [];
        if (cloudBooks.length && !hasSubcollectionBooks.current) {
          hasSyncedCloud.current = true;
          setBooks(cloudBooks.map(normalizeBook));
          cloudBooks.forEach((book) => {
            setDoc(getBookDoc(tenantId, book.id), normalizeBook(book), { merge: true }).catch(() => {
              setSaveError('Could not migrate all books to the improved cloud format.');
            });
          });
          setDoc(booksDoc, { books: [] }, { merge: true }).catch(() => {
            setSaveError('Could not finish migrating your library data.');
          });
        }
        setSaveError('');
        return;
      }

      if (!hasSyncedCloud.current) {
        hasSyncedCloud.current = true;
        setDoc(booksDoc, {}).catch(() => {
          setSaveError('Could not create your cloud library. Your local copy is still visible.');
        });
      }
    }, () => {
      setSaveError('Could not sync with the cloud. Check your connection and try again.');
    });

    return () => {
      unsubscribeBooks();
      unsubscribeLibrary();
    };
  }, [accessGranted, tenantId]);

  useEffect(() => {
    function updateBackToTopVisibility() {
      setShowBackToTop(window.scrollY > 480);
    }

    updateBackToTopVisibility();
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateBackToTopVisibility);
    };
  }, []);

  function saveBooks(updater, syncBookChange) {
    if (!tenantId || !accessGranted) {
      return;
    }

    setBooks((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      setIsSavingBooks(true);
      setSaveError('');
      syncBookChange(next, current)
        .catch(() => {
          setSaveError('Could not save your latest change to the cloud. Please try again.');
        })
        .finally(() => {
          setIsSavingBooks(false);
        });
      return next;
    });
  }

  const stats = useMemo(() => {
    const read = books.filter((book) => book.status === 'Read');
    const ratedRead = read.filter((book) => book.rating);
    const average = ratedRead.length ? ratedRead.reduce((sum, book) => sum + Number(book.rating), 0) / ratedRead.length : 0;
    const totalPagesRead = read.reduce((sum, book) => sum + (Number(book.pages) || 0), 0);

    return {
      total: books.length,
      read: read.length,
      reading: books.filter((book) => book.status === 'In Progress').length,
      average: average.toFixed(1),
      totalPagesRead,
    };
  }, [books]);

  const authors = useMemo(() => {
    return [...new Set(books.map((book) => book.author).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const authorStats = useMemo(() => {
    const stats = {};
    books.forEach((book) => {
      const author = book.author;
      if (!author) return;
      
      if (!stats[author]) {
        stats[author] = {
          totalBooks: 0,
          readBooks: 0,
          totalPages: 0,
          avgRating: 0,
          ratedBooks: 0,
          genres: new Set(),
        };
      }
      
      stats[author].totalBooks++;
      stats[author].genres.add(book.bookType);
      
      if (book.status === 'Read') {
        stats[author].readBooks++;
        stats[author].totalPages += Number(book.pages) || 0;
        
        if (book.rating) {
          stats[author].ratedBooks++;
          stats[author].avgRating += Number(book.rating);
        }
      }
    });
    
    Object.keys(stats).forEach((author) => {
      const stat = stats[author];
      stat.avgRating = stat.ratedBooks > 0 ? (stat.avgRating / stat.ratedBooks).toFixed(1) : 0;
      stat.genres = Array.from(stat.genres);
    });
    
    return stats;
  }, [books]);

  const selectedAuthorStats = selectedAuthor ? authorStats[selectedAuthor] : null;
  const selectedAuthorBooks = selectedAuthor 
    ? books.filter((book) => book.author === selectedAuthor).sort((a, b) => a.title.localeCompare(b.title))
    : [];

  const seriesNames = useMemo(() => {
    return [...new Set(books.map((book) => book.seriesName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const tagNames = useMemo(() => {
    return [...new Set(books.flatMap((book) => book.tags || []))].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const advancedStats = useMemo(() => {
    const read = books.filter((book) => book.status === 'Read');
    const currentYear = new Date().getFullYear();
    const yearRead = read.filter((book) => {
      if (!book.dateFinished) return false;
      return new Date(book.dateFinished).getFullYear() === currentYear;
    });

    // Genre breakdown
    const genreBreakdown = {};
    books.forEach((book) => {
      const genre = book.bookType || 'Unknown';
      genreBreakdown[genre] = (genreBreakdown[genre] || 0) + 1;
    });

    // Monthly trends
    const monthlyTrends = {};
    read.forEach((book) => {
      if (!book.dateFinished) return;
      const date = new Date(book.dateFinished);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrends[monthKey] = (monthlyTrends[monthKey] || 0) + 1;
    });

    // Pages per book average
    const pagesPerBook = read.filter((book) => book.pages).length > 0
      ? Math.round(read.filter((book) => book.pages).reduce((sum, book) => sum + Number(book.pages), 0) / read.filter((book) => book.pages).length)
      : 0;

    // Goal progress
    const goalProgress = yearlyGoal > 0 ? Math.round((yearRead.length / yearlyGoal) * 100) : 0;
    const goalRemaining = Math.max(0, yearlyGoal - yearRead.length);

    return {
      genreBreakdown,
      monthlyTrends,
      pagesPerBook,
      goalProgress,
      goalRemaining,
      yearReadCount: yearRead.length,
    };
  }, [books, yearlyGoal]);

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
  
  const duplicateBook = useMemo(() => {
    if (!form.title.trim() || !form.author.trim()) {
      return null;
    }
    return books.find((book) => 
      book.title.toLowerCase().trim() === form.title.toLowerCase().trim() &&
      book.author.toLowerCase().trim() === form.author.toLowerCase().trim()
    );
  }, [books, form.title, form.author]);

  const visibleBooks = useMemo(() => {
    return books
      .filter((book) => filter === 'All' || book.status === filter)
      .filter((book) => !showFavoritesOnly || book.favorite)
      .filter((book) => `${book.title} ${book.author} ${book.bookType} ${book.seriesName} ${book.favorite ? 'favorite' : ''} ${book.notes} ${book.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [books, filter, query, showFavoritesOnly]);

  const emptyState = useMemo(() => {
    if (!books.length) {
      return {
        icon: <BookOpen size={34} />,
        title: 'Start your book log',
        message: 'Add your first book on the left. Title and author are all you need.',
      };
    }

    if (showFavoritesOnly) {
      return {
        icon: <Star size={34} />,
        title: 'No favorites yet',
        message: 'Mark a book as a favorite and it will show up here.',
      };
    }

    if (query.trim()) {
      return {
        icon: <Search size={34} />,
        title: 'No matching books',
        message: `Nothing matched “${query.trim()}”. Try a title, author, tag, or series.`,
      };
    }

    return {
      icon: <Library size={34} />,
      title: `No ${filter.toLowerCase()} books`,
      message: 'Try a different status filter or add another book.',
    };
  }, [books.length, filter, query, showFavoritesOnly]);

  const tenantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    if (tenantId) {
      url.searchParams.set('tenant', tenantId);
    }
    return url.toString();
  }, [tenantId]);

  function openLibrary(nextTenant) {
    setTenantUrl(nextTenant);
    setTenantInput(nextTenant);
    setRenameInput(nextTenant);
    setTenantId(nextTenant);
    setAccessGranted(true);
    setLibraryError('');
    setShowTenantPanel(false);
  }

  async function createLibrary(event) {
    event.preventDefault();

    if (libraryBusy) {
      return;
    }

    if (!tenantPasswordInput) {
      setLibraryError('Create a password for this library.');
      return;
    }

    try {
      setLibraryBusy(true);
      setLibraryError('');
      const nextTenant = normalizeLibraryName(tenantInput);

      if (!nextTenant) {
        setLibraryError('Enter a library name with at least one letter or number.');
        return;
      }

      const nextDoc = doc(db, 'bookLogs', nextTenant);
      const snapshot = await getDoc(nextDoc);

      if (snapshot.exists()) {
        setLibraryError('That library name is already taken. Try signing in or choose a different name.');
        return;
      }

      await setDoc(nextDoc, { password: tenantPasswordInput });
      openLibrary(nextTenant);
    } catch {
      setLibraryError('Could not create that library. Check your connection and try again.');
    } finally {
      setLibraryBusy(false);
    }
  }

  async function signInToLibrary(event) {
    event.preventDefault();

    if (libraryBusy) {
      return;
    }

    if (!tenantPasswordInput) {
      setLibraryError('Enter the library password.');
      return;
    }

    try {
      setLibraryBusy(true);
      setLibraryError('');
      const nextTenant = normalizeLibraryName(tenantInput);

      if (!nextTenant) {
        setLibraryError('Enter a library name with at least one letter or number.');
        return;
      }

      const nextDoc = doc(db, 'bookLogs', nextTenant);
      const snapshot = await getDoc(nextDoc);

      if (!snapshot.exists()) {
        setLibraryError('No library uses that name. Try creating it instead.');
        return;
      }

      const savedPassword = snapshot.data().password || '';

      if (savedPassword && savedPassword !== tenantPasswordInput) {
        setLibraryError('That password does not match this library.');
        return;
      }

      if (!savedPassword) {
        await setDoc(nextDoc, { password: tenantPasswordInput }, { merge: true });
      }

      openLibrary(nextTenant);
    } catch {
      setLibraryError('Could not sign in. Check your connection and try again.');
    } finally {
      setLibraryBusy(false);
    }
  }

  async function renameLibrary(event) {
    event.preventDefault();

    if (libraryBusy) {
      return;
    }

    const nextTenant = normalizeLibraryName(renameInput);

    if (!nextTenant) {
      setLibraryError('Enter a library name with at least one letter or number.');
      return;
    }

    if (!tenantId || nextTenant === tenantId) {
      setRenameInput(tenantId);
      return;
    }

    try {
      setLibraryBusy(true);
      setLibraryError('');
      const currentDoc = getBooksDoc(tenantId);
      const nextDoc = getBooksDoc(nextTenant);
      const currentSnapshot = await getDoc(currentDoc);
      const nextSnapshot = await getDoc(nextDoc);

      if (nextSnapshot.exists()) {
        setLibraryError('That library name is already taken.');
        return;
      }

      await setDoc(nextDoc, currentSnapshot.exists() ? currentSnapshot.data() : { books, password: tenantPasswordInput });
      await Promise.all(books.map((book) => setDoc(getBookDoc(nextTenant, book.id), book)));
      await Promise.all(books.map((book) => deleteDoc(getBookDoc(tenantId, book.id))));
      await deleteDoc(currentDoc);

      setTenantUrl(nextTenant);
      localStorage.removeItem(getStorageKey(tenantId));
      setTenantInput(nextTenant);
      setRenameInput(nextTenant);
      setTenantId(nextTenant);
      setLibraryError('');
    } catch {
      setLibraryError('Could not rename the library. Check your connection and try again.');
    } finally {
      setLibraryBusy(false);
    }
  }

  function resetLibraryAccess() {
    setTenantUrl(null);
    localStorage.removeItem(TENANT_KEY);
    if (tenantId) {
      localStorage.removeItem(getStorageKey(tenantId));
    }
    setTenantInput('');
    setTenantPasswordInput('');
    setRenameInput('');
    setTenantId(null);
    setBooks([]);
    setAccessGranted(false);
    setLibraryMode('signIn');
    setLibraryError('');
    setShowTenantPanel(false);
  }

  function signOutLibrary() {
    resetLibraryAccess();
  }

  async function deleteLibrary() {
    if (libraryBusy || !tenantId) {
      return;
    }

    if (!window.confirm(`Delete the "${tenantId}" library and all of its books? This cannot be undone.`)) {
      return;
    }

    const enteredPassword = window.prompt('Enter this library password to delete it.');

    if (!enteredPassword) {
      setLibraryError('Enter the library password to delete this library.');
      return;
    }

    try {
      setLibraryBusy(true);
      setLibraryError('');
      const libraryDoc = getBooksDoc(tenantId);
      const snapshot = await getDoc(libraryDoc);
      const savedPassword = snapshot.exists() ? snapshot.data().password || '' : '';

      if (savedPassword && savedPassword !== enteredPassword) {
        setLibraryError('That password does not match this library.');
        return;
      }

      await Promise.all(books.map((book) => deleteDoc(getBookDoc(tenantId, book.id))));
      await deleteDoc(libraryDoc);
      resetLibraryAccess();
    } catch {
      setLibraryError('Could not delete the library. Check your connection and try again.');
    } finally {
      setLibraryBusy(false);
    }
  }

  async function copyTenantLink() {
    try {
      await navigator.clipboard.writeText(tenantUrl);
      setLibraryError('');
    } catch {
      setLibraryError('Could not copy the library link.');
    }
  }

  async function copyBookText(book) {
    try {
      await navigator.clipboard.writeText(formatBookShareText(book));
      setCopiedBookId(book.id);
      setTimeout(() => {
        setCopiedBookId((current) => (current === book.id ? null : current));
      }, 1600);
      setSaveError('');
    } catch {
      setSaveError('Could not copy that book. Check your browser permissions and try again.');
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    if (duplicateBook && !window.confirm(`"${form.title}" by ${form.author} already exists in your book log. Add it anyway?`)) {
      return;
    }

    const nextBook = {
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
      pages: form.pages ? Number(form.pages) : '',
    };

    saveBooks(
      (current) => [nextBook, ...current],
      () => setDoc(getBookDoc(tenantId, nextBook.id), nextBook),
    );
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
    saveBooks(
      (current) => current.filter((book) => book.id !== id),
      () => deleteDoc(getBookDoc(tenantId, id)),
    );
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

    const updatedBook = {
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
      pages: editForm.pages ? Number(editForm.pages) : '',
    };

    saveBooks(
      (current) => current.map((book) => (book.id === editingId ? updatedBook : book)),
      () => setDoc(getBookDoc(tenantId, editingId), updatedBook, { merge: true }),
    );
    cancelEditing();
  }

  function markBookAsRead(id) {
    setRatingBookId(id);
  }

  function finishBook(id, rating = null) {
    let updatedBook = null;

    saveBooks(
      (current) => current.map((book) => {
        if (book.id !== id) {
          return book;
        }

        updatedBook = {
          ...book,
          status: 'Read',
          rating,
          dateFinished: book.dateFinished || todayDate(),
        };

        return updatedBook;
      }),
      () => setDoc(getBookDoc(tenantId, id), updatedBook, { merge: true }),
    );
    setRatingBookId(null);
  }

  function markBookInProgress(id) {
    let updatedBook = null;

    saveBooks(
      (current) => current.map((book) => {
        if (book.id !== id) {
          return book;
        }

        updatedBook = {
          ...book,
          status: 'In Progress',
          rating: null,
          dateFinished: '',
        };

        return updatedBook;
      }),
      () => setDoc(getBookDoc(tenantId, id), updatedBook, { merge: true }),
    );
  }

  if (!tenantId || !accessGranted) {
    const isCreatingLibrary = libraryMode === 'create';

    return (
      <main className="app-shell">
        <section className="library-gate">
          <p className="eyebrow"><Library size={16} /> Personal Library</p>
          <h1>{isCreatingLibrary ? 'Create your library' : 'Sign in to your library'}</h1>
          <p>{isCreatingLibrary ? 'Choose a unique library name and password to start your book log.' : 'Enter your library name and password to open the shared book log.'}</p>
          <div className="library-mode-buttons">
            <button className={isCreatingLibrary ? 'active' : ''} disabled={libraryBusy} onClick={() => { setLibraryMode('create'); setLibraryError(''); }} type="button">Create</button>
            <button className={!isCreatingLibrary ? 'active' : ''} disabled={libraryBusy} onClick={() => { setLibraryMode('signIn'); setLibraryError(''); }} type="button">Sign in</button>
          </div>
          <form onSubmit={isCreatingLibrary ? createLibrary : signInToLibrary}>
            <input value={tenantInput} disabled={libraryBusy} onChange={(event) => setTenantInput(event.target.value)} placeholder="family-name" autoFocus />
            <input value={tenantPasswordInput} disabled={libraryBusy} onChange={(event) => setTenantPasswordInput(event.target.value)} placeholder="Library password" type="password" />
            <button disabled={libraryBusy} type="submit">{libraryBusy ? 'Working...' : isCreatingLibrary ? 'Create library' : 'Sign in'}</button>
          </form>
          {libraryError && <p className="library-error">{libraryError}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className={showTenantPanel ? 'tenant-panel open' : 'tenant-panel'}>
        <div className="tenant-nav">
          <button className="tenant-toggle-button" onClick={() => setShowTenantPanel((current) => !current)} type="button">
            <Library size={16} />
            <span>Library</span>
            <strong>{tenantId}</strong>
          </button>
          <span className="tenant-nav-hint">{showTenantPanel ? 'Manage sharing and settings' : 'Tap to manage'}</span>
        </div>
        {showTenantPanel && (
          <div className="tenant-controls">
            <form onSubmit={renameLibrary}>
              <input value={renameInput} disabled={libraryBusy} onChange={(event) => setRenameInput(event.target.value)} placeholder="new-library-name" />
              <button disabled={libraryBusy} type="submit">{libraryBusy ? 'Renaming...' : 'Rename'}</button>
            </form>
            <button className="copy-link-button" disabled={libraryBusy} onClick={copyTenantLink} type="button">Copy library link</button>
            <button className="sign-out-button" disabled={libraryBusy} onClick={signOutLibrary} type="button">Sign out</button>
            <button className="delete-library-button" disabled={libraryBusy} onClick={deleteLibrary} type="button">{libraryBusy ? 'Working...' : 'Delete library'}</button>
          </div>
        )}
        {showTenantPanel && libraryError && <p className="library-error">{libraryError}</p>}
      </section>

      <section className="hero">
        <div>
          <p className="eyebrow"><Library size={16} /> Personal Library</p>
          <h1>Book Log</h1>
          <p className="hero-copy">Track what you read, what you are reading, your ratings, and the notes you want to remember.</p>
        </div>
        <div className="hero-card">
          <div className="hero-book-illustration" aria-hidden="true">
            <span className="hero-book hero-book-back" />
            <span className="hero-book hero-book-front">
              <BookOpen size={38} />
            </span>
          </div>
          <div className="hero-card-stat">
            <strong>{stats.total}</strong>
            <span>books logged</span>
          </div>
        </div>
      </section>

      <section className={yearlyGoal > 0 ? 'stats-grid' : 'stats-grid compact'}>
        <Stat icon={<CheckCircle2 />} label="Finished" value={stats.read} />
        <Stat icon={<BookOpen />} label="In progress" value={stats.reading} />
        <Stat icon={<Star />} label="Avg read rating" value={stats.average} />
        {yearlyGoal > 0 && <Stat icon={<Target />} label="Yearly goal" value={`${advancedStats.yearReadCount}/${yearlyGoal}`} />}
      </section>

      {yearlyGoal > 0 && (
        <section className="goal-progress-section">
          <div className="goal-progress-header">
            <div className="goal-progress-info">
              <Target size={18} />
              <span>Reading Goal Progress</span>
            </div>
            <span className="goal-progress-text">{advancedStats.yearReadCount} of {yearlyGoal} books ({advancedStats.goalProgress}%)</span>
          </div>
          <div className="goal-progress-bar">
            <div className="goal-progress-fill" style={{ width: `${Math.min(advancedStats.goalProgress, 100)}%` }} />
          </div>
          {advancedStats.goalRemaining > 0 && (
            <p className="goal-remaining">{advancedStats.goalRemaining} more books to reach your goal!</p>
          )}
          {advancedStats.goalProgress >= 100 && (
            <p className="goal-complete">🎉 You've reached your reading goal!</p>
          )}
        </section>
      )}

      <section className={showStatsPanel ? 'stats-panel open' : 'stats-panel'}>
        <button className="stats-toggle-button" onClick={() => setShowStatsPanel((current) => !current)} type="button">
          <BarChart3 size={16} />
          <span>Advanced Statistics</span>
          <TrendingUp size={16} />
        </button>
        {showStatsPanel && (
          <div className="stats-content">
            <div className="stats-section">
              <h3>📖 Reading Goals</h3>
              <div className="goal-input-row">
                <label>
                  Yearly reading goal:
                  <input
                    type="number"
                    value={goalInput}
                    onChange={(event) => setGoalInput(event.target.value)}
                    placeholder="12"
                    min="1"
                  />
                </label>
                <button onClick={() => { setYearlyGoal(Number(goalInput)); setGoalInput(''); }} type="button">
                  Set goal
                </button>
                {yearlyGoal > 0 && (
                  <button className="secondary-button" onClick={() => { setYearlyGoal(0); setGoalInput(''); }} type="button">
                    Clear
                  </button>
                )}
              </div>
              {yearlyGoal > 0 && (
                <div className="goal-stats">
                  <p><strong>Books read this year:</strong> {advancedStats.yearReadCount}</p>
                  <p><strong>Progress:</strong> {advancedStats.goalProgress}%</p>
                  <p><strong>Remaining:</strong> {advancedStats.goalRemaining} books</p>
                </div>
              )}
            </div>

            <div className="stats-section">
              <h3>📊 Genre Breakdown</h3>
              <div className="genre-list">
                {Object.entries(advancedStats.genreBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([genre, count]) => (
                    <div key={genre} className="genre-item">
                      <span className="genre-name">{genre}</span>
                      <span className="genre-count">{count} book{count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="stats-section">
              <h3>📈 Monthly Reading Trends</h3>
              <div className="monthly-trends">
                {Object.entries(advancedStats.monthlyTrends)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .slice(0, 6)
                  .map(([month, count]) => (
                    <div key={month} className="month-item">
                      <span className="month-name">{month}</span>
                      <span className="month-count">{count} book{count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                {Object.keys(advancedStats.monthlyTrends).length === 0 && (
                  <p className="no-data">No finished books with dates yet</p>
                )}
              </div>
            </div>

            <div className="stats-section">
              <h3>📄 Pages Statistics</h3>
              <div className="pages-stats">
                <p><strong>Total pages read:</strong> {stats.totalPagesRead.toLocaleString()}</p>
                <p><strong>Average pages per book:</strong> {advancedStats.pagesPerBook}</p>
              </div>
            </div>

            <div className="stats-section">
              <h3>👤 Author Profiles</h3>
              <div className="author-list">
                {authors.slice(0, 8).map((author) => (
                  <button
                    key={author}
                    className={`author-chip ${selectedAuthor === author ? 'active' : ''}`}
                    onClick={() => setSelectedAuthor(selectedAuthor === author ? null : author)}
                    type="button"
                  >
                    <User size={14} />
                    {author}
                    <span className="author-book-count">{authorStats[author]?.totalBooks || 0}</span>
                  </button>
                ))}
                {authors.length > 8 && (
                  <p className="more-authors">+{authors.length - 8} more authors</p>
                )}
              </div>
              {selectedAuthorStats && (
                <div className="author-detail">
                  <div className="author-detail-header">
                    <h4>{selectedAuthor}</h4>
                    <button onClick={() => setSelectedAuthor(null)} type="button" className="close-button">×</button>
                  </div>
                  <div className="author-stats-grid">
                    <div className="author-stat">
                      <span className="author-stat-label">Total Books</span>
                      <span className="author-stat-value">{selectedAuthorStats.totalBooks}</span>
                    </div>
                    <div className="author-stat">
                      <span className="author-stat-label">Read</span>
                      <span className="author-stat-value">{selectedAuthorStats.readBooks}</span>
                    </div>
                    <div className="author-stat">
                      <span className="author-stat-label">Avg Rating</span>
                      <span className="author-stat-value">{selectedAuthorStats.avgRating || '—'}</span>
                    </div>
                    <div className="author-stat">
                      <span className="author-stat-label">Total Pages</span>
                      <span className="author-stat-value">{selectedAuthorStats.totalPages.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="author-genres">
                    <strong>Genres:</strong> {selectedAuthorStats.genres.join(', ')}
                  </div>
                  <div className="author-books">
                    <strong>Books:</strong>
                    <ul>
                      {selectedAuthorBooks.map((book) => (
                        <li key={book.id}>
                          <span className="book-title-mini">{book.title}</span>
                          <span className="book-status-mini">{book.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel layout-grid">
        <form className={showMoreDetails ? 'book-form open' : 'book-form'} onSubmit={addBook} noValidate>
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
              <label>
                Pages
                <input type="number" value={form.pages} onChange={(event) => updateForm('pages', event.target.value)} placeholder="300" min="1" />
              </label>
              <label className="toggle-field">
                <input checked={form.newberyAward} onChange={(event) => updateForm('newberyAward', event.target.checked)} type="checkbox" />
                Newbery Award winner
              </label>
            </div>
          )}
          {addAttempted && !canAddBook && <p className="form-helper">Add a title and author to save this book.</p>}
          {duplicateBook && <p className="duplicate-warning">⚠️ This book already exists in your library</p>}
          {saveError && <p className="save-error">{saveError}</p>}
          {isSavingBooks && <p className="save-status">Saving changes...</p>}
          <button disabled={isSavingBooks} type="submit"><Plus size={18} /> {isSavingBooks ? 'Saving...' : 'Add book'}</button>
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
              <article className={`book-card status-${book.status.toLowerCase().replace(/\s+/g, '-')}`} key={book.id}>
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
                    <label>
                      Pages
                      <input type="number" value={editForm.pages} onChange={(event) => updateEditForm('pages', event.target.value)} min="1" />
                    </label>
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
                        {copiedBookId === book.id && <span className="copied-label">Copied</span>}
                        <button className="icon-button" onClick={() => copyBookText(book)} aria-label={`Copy ${book.title} as text`}><Copy size={18} /></button>
                        <button className="icon-button" onClick={() => startEditing(book)} aria-label={`Edit ${book.title}`}><Edit3 size={18} /></button>
                        <button className="icon-button" onClick={() => confirmDeleteBook(book)} aria-label={`Delete ${book.title}`}><Trash2 size={18} /></button>
                      </div>
                    </div>
                    <div className="book-meta">
                      {book.status === 'Read' && book.rating && <span className="rating-stars" aria-label={`${book.rating} out of 5 stars`}><Star size={16} /> {renderStars(book.rating)}</span>}
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
                <div className="empty-state-icon">{emptyState.icon}</div>
                <h3>{emptyState.title}</h3>
                <p>{emptyState.message}</p>
                {!books.length && (
                  <button className="empty-state-button" onClick={() => document.querySelector('.book-form input')?.focus()} type="button">
                    Add your first book
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
      {showBackToTop && (
        <button className="back-to-top-button" onClick={scrollToTop} type="button" aria-label="Back to top">
          <ArrowUp size={20} />
          Top
        </button>
      )}
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
