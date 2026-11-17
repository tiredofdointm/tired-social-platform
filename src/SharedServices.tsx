import {useEffect, useState} from 'react';
import type {FormEvent, ReactNode} from 'react';

const categories = ['Photography', 'DJ', 'Security', 'Other'];
type Listing = {id:string; title:string; category:string; description:string};
type DirectoryEntry = Listing & {display_name:string; handle:string};
type Publication = 'published' | 'pending' | 'rejected';
type Publishing = {
  manual_review:boolean;
  admin:boolean;
  mine:(Listing & {publication:Publication})[];
  pending:(Listing & {handle:string})[];
};
type View =
  | {kind:'loading' | 'preview' | 'signed-out' | 'error'}
  | {kind:'ready'; csrf:string; listings:DirectoryEntry[]; publishing:Publishing};

class DirectoryError extends Error {
  constructor(readonly status:number) { super('Could not load or save services.'); }
}

async function get<T>(resource:string, signal:AbortSignal):Promise<T> {
  const response = await fetch('/api/v1/' + resource, {signal});
  if (!response.ok) throw new DirectoryError(response.status);
  return response.json();
}

export function SharedServices({preview}:{preview:ReactNode}) {
  const [view, setView] = useState<View>({kind:'loading'});
  const [refresh, setRefresh] = useState(0);
  const [category, setCategory] = useState('All categories');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const {signal} = controller;
    async function load() {
      try {
        const config = await get<{mode:string}>('auth/config', signal);
        if (signal.aborted) return;
        if (config.mode === 'preview') {
          setView({kind:'preview'});
          return;
        }
        const session = await get<{csrfToken:string}>('me', signal);
        const [directory, publishing] = await Promise.all([
          get<{listings:DirectoryEntry[]}>('services', signal),
          get<Publishing>('services/publishing', signal),
        ]);
        if (!signal.aborted) setView({kind:'ready', csrf:session.csrfToken, listings:directory.listings, publishing});
      } catch (error) {
        if (!signal.aborted) setView({kind:error instanceof DirectoryError && error.status === 401 ? 'signed-out' : 'error'});
      }
    }
    function accountChanged() {
      controller.abort();
      setView({kind:'signed-out'});
      setMessage('');
    }
    void load();
    window.addEventListener('tired-account-change', accountChanged);
    return () => {
      controller.abort();
      window.removeEventListener('tired-account-change', accountChanged);
    };
  }, [refresh]);

  async function change(path:string, method:string, body:unknown, success:(result:{publication?:Publication})=>string) {
    if (view.kind !== 'ready' || busy) return false;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/v1/services' + path, {
        method,
        headers:{'Content-Type':'application/json', 'X-CSRF-Token':view.csrf},
        body:body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401) {
        setView({kind:'signed-out'});
        return false;
      }
      if (!response.ok) {
        setMessage(response.status === 404 ? 'That listing is no longer available. The list has been refreshed.' : 'Could not save the change.');
        if (response.status === 404) setRefresh(value => value + 1);
        return false;
      }
      setMessage(success(await response.json()));
      setRefresh(value => value + 1);
      return true;
    } catch {
      setMessage('Could not save the change. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const saved = await change('', 'POST', {
      title:fields.get('title'), category:fields.get('category'), description:fields.get('description'),
    }, result => result.publication === 'pending' ? 'Service submitted for review.' : 'Service published.');
    if (saved) form.reset();
  }

  if (view.kind === 'preview') return preview;
  if (view.kind === 'loading') return <p role="status">Loading services…</p>;
  if (view.kind === 'error') return <section className="panel">
    <p role="alert">Could not load shared services.</p>
    <button onClick={() => {setView({kind:'loading'}); setRefresh(value => value + 1);}}>Try again</button>
  </section>;
  if (view.kind === 'signed-out') return <section className="panel">
    <h1>Find talent</h1><p>Sign in to browse providers and list your services.</p>
    <a className="primary" href="/auth/google">Sign in with Google</a>
  </section>;
  if (view.kind !== 'ready') return null;

  const {publishing, listings} = view;
  const search = query.trim().toLowerCase();
  const matches = listings.filter(item =>
    (category === 'All categories' || item.category === category) &&
    [item.title, item.description, item.display_name, item.handle].some(value => value.toLowerCase().includes(search)));

  return <section className="shared-community stack">
    <h1>Find talent</h1>
    <p role="status">{message}</p>
    <details className="panel">
      <summary>List your service</summary>
      <form onSubmit={event => void submit(event)}>
        <label>Service title<input name="title" required maxLength={120}/></label>
        <label>Category<select name="category" required>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Description<textarea name="description" required maxLength={1000}/></label>
        <button className="primary" disabled={busy}>{publishing.manual_review ? 'Submit for review' : 'Publish service'}</button>
      </form>
    </details>
    {publishing.mine.length > 0 && <details className="panel">
      <summary>Your listings</summary>
      {publishing.mine.map(item => <article key={item.id}>
        <h3>{item.title}</h3><p>{item.category} · {item.publication}</p>
        <button disabled={busy} aria-label={`Withdraw ${item.title}`} onClick={() => void change('/' + item.id, 'DELETE', undefined, () => 'Service withdrawn.')}>Withdraw</button>
      </article>)}
    </details>}
    {publishing.admin && <section className="panel">
      <h2>Service publishing</h2>
      <p>{publishing.manual_review ? 'New services require approval.' : 'New services publish automatically.'}</p>
      <button disabled={busy} onClick={() => void change('/publishing', 'PUT',
        {manualReview:!publishing.manual_review}, () => 'Service publishing policy saved.')}>
        {publishing.manual_review ? 'Enable automatic publishing' : 'Require manual review'}
      </button>
      {publishing.pending.length > 0 && <h3>Pending services</h3>}
      {publishing.pending.map(item => <article key={item.id}>
        <h3>{item.title}</h3><p>{item.category} · @{item.handle}</p><p className="post-text">{item.description}</p>
        <div className="actions">
          <button disabled={busy} aria-label={`Approve ${item.title}`} onClick={() => void change('/' + item.id + '/review', 'PUT',
            {decision:'published'}, () => 'Service approved.')}>Approve</button>
          <button disabled={busy} aria-label={`Reject ${item.title}`} onClick={() => void change('/' + item.id + '/review', 'PUT',
            {decision:'rejected'}, () => 'Service rejected.')}>Reject</button>
        </div>
      </article>)}
    </section>}
    <div className="filters">
      <label>Search services<input type="search" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <label>Category<select value={category} onChange={event => setCategory(event.target.value)}>
        {['All categories', ...categories].map(item => <option key={item}>{item}</option>)}
      </select></label>
    </div>
    <div className="grid">{matches.map(item => <article className="panel" key={item.id}>
      <span className="eyebrow">{item.category}</span><h2>{item.title}</h2>
      <p>{item.display_name} · @{item.handle}</p><p className="post-text">{item.description}</p>
    </article>)}</div>
    {!matches.length && <p>{listings.length ? 'No services match your filters.' : 'No services have been published yet.'}</p>}
  </section>;
}
