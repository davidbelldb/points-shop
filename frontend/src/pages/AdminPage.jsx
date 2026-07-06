import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';
import AdminOrdersSection from './AdminOrdersSection.jsx';
import AdminImpersonateSection from './AdminImpersonateSection.jsx';
import AdminHeroSlides from './AdminHeroSlides.jsx';
import AdminAudioSection from './AdminAudioSection.jsx';
import AdminGamesSection from './AdminGamesSection.jsx';
import AdminMagic8BallSection from './AdminMagic8BallSection.jsx';
import AdminWheelSection from './AdminWheelSection.jsx';
import AdminEntertainmentSection from './AdminEntertainmentSection.jsx';
import AdminShutTheBox15Section from './AdminShutTheBox15Section.jsx';
import AdminSneakyButtonSection from './AdminSneakyButtonSection.jsx';
import AdminDuckySection from './AdminDuckySection.jsx';
import AdminSurveysSection from './AdminSurveysSection.jsx';
import AdminPushSection from './AdminPushSection.jsx';
import AdminGroceriesSection from './AdminGroceriesSection.jsx';
import AdminScrollsSection from './AdminScrollsSection.jsx';
import AdminForecastSection from './AdminForecastSection.jsx';
import AdminJustSayWordSection from './AdminJustSayWordSection.jsx';
import { useSettings } from '../lib/SettingsContext.jsx';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

// Collapsible card for admin sections.
// Open/closed state is persisted to localStorage so it survives page reloads.
function AdminCollapsible({ title, storageKey, defaultOpen = false, children }) {
  const key = storageKey ?? `admin-section::${title}`;
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? defaultOpen; }
    catch { return defaultOpen; }
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors"
      >
        <span className="text-base font-semibold">{title}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-neutral-100 p-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { account, refresh } = useBasket();
  const { settings, refresh: refreshSettings } = useSettings();
  const [products, setProducts] = useState([]);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadProducts() {
    try { setProducts(await api.admin.listProducts()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function loadCodes() {
    try { setCodes(await api.admin.listDiscountCodes()); }
    catch (e) { setError(e.message); }
  }

  useEffect(() => { loadProducts(); loadCodes(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
      </div>

      <AdminCollapsible title="Impersonate" storageKey="admin::impersonate">
        <AdminImpersonateSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Branding" storageKey="admin::branding">
        <BrandingSection settings={settings} onChanged={refreshSettings} />
      </AdminCollapsible>

      <AdminCollapsible title="Push notification" storageKey="admin::push">
        <AdminPushSection />
      </AdminCollapsible>

      <AdminCollapsible title="Grocery catalogue" storageKey="admin::groceries">
        <AdminGroceriesSection />
      </AdminCollapsible>

      <AdminCollapsible title="Voice notes" storageKey="admin::audio">
        <AdminAudioSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Hero carousel slides" storageKey="admin::hero-slides">
        <AdminHeroSlides bare />
      </AdminCollapsible>

      <AdminCollapsible title="Account & points" storageKey="admin::account">
        <AccountSection account={account} onChanged={refresh} />
      </AdminCollapsible>

      <AdminCollapsible title="Katie's password" storageKey="admin::katie-password">
        <KatiePasswordSection />
      </AdminCollapsible>

      <AdminCollapsible title="Products" storageKey="admin::products">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-2">
              {products.map((p) => (
                <ProductRow key={p.id} product={p} onChanged={() => { loadProducts(); refresh(); }} />
              ))}
            </ul>
            <NewProductForm onCreated={() => { loadProducts(); refresh(); }} />
          </div>
        )}
      </AdminCollapsible>

      <AdminCollapsible title="Discount codes" storageKey="admin::discounts">
        <DiscountCodesSection codes={codes} onChanged={loadCodes} />
      </AdminCollapsible>

      <AdminCollapsible title="Orders" storageKey="admin::orders">
        <AdminOrdersSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Surveys" storageKey="admin::surveys">
        <AdminSurveysSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Games settings" storageKey="admin::games">
        <AdminGamesSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Magic 8-Ball" storageKey="admin::magic8ball">
        <AdminMagic8BallSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Wheel of Misfortune" storageKey="admin::wheel">
        <AdminWheelSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Wheel of Entertainment" storageKey="admin::entertainment">
        <AdminEntertainmentSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Shut the Box 15" storageKey="admin::stb15">
        <AdminShutTheBox15Section bare />
      </AdminCollapsible>

      <AdminCollapsible title="Sneaky Button" storageKey="admin::sneaky-button">
        <AdminSneakyButtonSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Ducky Derby" storageKey="admin::ducky">
        <AdminDuckySection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Scrolls (raven messages)" storageKey="admin::scrolls">
        <AdminScrollsSection />
      </AdminCollapsible>

      <AdminCollapsible title="Daily Forecast Scroll" storageKey="admin::forecast">
        <AdminForecastSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Dirty Talk" storageKey="admin::jstw">
        <AdminJustSayWordSection bare />
      </AdminCollapsible>

      <AdminCollapsible title="Relationship Timeline" storageKey="admin::timeline">
        <p className="text-sm text-zinc-500">
          Milestones, page title/subtitle, and theme are now all managed from the Journal page.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            to="/journal"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900"
          >
            Manage timeline (Journal) →
          </Link>
          <Link
            to="/timeline"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900"
          >
            View timeline →
          </Link>
        </div>
      </AdminCollapsible>

      <AdminCollapsible title="Storage hygiene" storageKey="admin::storage">
        <p className="text-sm text-zinc-500 dark:text-neutral-400">
          Review uploaded Reel/Story video files and clear out anything 14+ days old to free up disk space.
        </p>
        <div className="mt-3">
          <Link
            to="/admin/storage"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
          >
            Manage storage →
          </Link>
        </div>
      </AdminCollapsible>

      <AdminCollapsible title="Download stories" storageKey="admin::stories-export">
        <StoriesExportSection />
      </AdminCollapsible>
    </div>
  );
}

// Bulk-download every Sneaky Story (photos + videos) as a single zip, either
// for one person or both. The download itself is just a plain link to a
// server endpoint that streams the zip — no fetch/blob handling needed.
function StoriesExportSection() {
  const [users, setUsers] = useState([]);
  const [target, setTarget] = useState('all');
  const [since, setSince] = useState('');

  useEffect(() => {
    api.admin.listUsers().then(setUsers).catch(() => {});
  }, []);

  const href = api.admin.exportStoriesUrl(target, since);

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Bundles every past Sneaky Story's media into one zip file for backup — includes photos and videos,
        even ones only saved in a highlight reel.
      </p>
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
        Whose stories
        <select
          className={inputCls + ' mt-1'}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="all">Both</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
        Since (optional — leave blank for all time)
        <input
          type="date"
          className={inputCls + ' mt-1'}
          value={since}
          onChange={(e) => setSince(e.target.value)}
        />
      </label>
      {since && (
        <button
          type="button"
          onClick={() => setSince('')}
          className="text-xs text-neutral-500 underline decoration-dotted hover:text-neutral-700 dark:text-neutral-400"
        >
          Clear date (use all time)
        </button>
      )}
      <a
        href={href}
        className="block w-full rounded-md bg-amber-600 py-2 text-center text-sm font-semibold text-amber-900 hover:bg-amber-500"
      >
        Download zip
      </a>
    </div>
  );
}

function BrandingSection({ settings, onChanged }) {
  const [shopName, setShopName] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [bannerText, setBannerText] = useState('');
  const [bannerLink, setBannerLink] = useState('');
  const [bannerBg, setBannerBg] = useState('#0b8476');
  const [bannerFg, setBannerFg] = useState('#ffffff');
  const [countdownDate, setCountdownDate] = useState('');
  const [countdownTime, setCountdownTime] = useState('');
  const [clearKey, setClearKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const bannerEnabled = settings.banner_enabled === 'true';
  const featuredEnabled = settings.homepage_featured_enabled === 'true';

  useEffect(() => {
    setShopName(settings.shop_name ?? '');
    setHeroTitle(settings.hero_title ?? '');
    setHeroSubtitle(settings.hero_subtitle ?? '');
    setBannerText(settings.banner_text ?? '');
    setBannerLink(settings.banner_link_url ?? '');
    setBannerBg(settings.banner_bg_colour ?? '#0b8476');
    setBannerFg(settings.banner_text_colour ?? '#ffffff');
    setCountdownDate(settings.banner_countdown_date ?? '');
    setCountdownTime(settings.banner_countdown_time ?? '');
  }, [settings.shop_name, settings.hero_title, settings.hero_subtitle, settings.banner_text, settings.banner_link_url, settings.banner_bg_colour, settings.banner_text_colour, settings.banner_countdown_date, settings.banner_countdown_time]);

  async function toggleBanner() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateSettings({ banner_enabled: bannerEnabled ? 'false' : 'true' });
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function toggleFeatured() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateSettings({ homepage_featured_enabled: featuredEnabled ? 'false' : 'true' });
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true); setError(null);
    try {
      const { url } = await api.admin.upload(file);
      await api.admin.updateSettings({ logo_url: url });
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function clearLogo() {
    setBusy(true); setError(null);
    try { await api.admin.updateSettings({ logo_url: null }); await onChanged(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function saveText() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateSettings({
        shop_name: shopName,
        hero_title: heroTitle,
        hero_subtitle: heroSubtitle,
        banner_text: bannerText,
        banner_link_url: bannerLink.trim() || null,
        banner_bg_colour: bannerBg,
        banner_text_colour: bannerFg,
        banner_countdown_date: countdownDate,
        banner_countdown_time: countdownTime,
      });
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">

      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md bg-neutral-100 text-neutral-400">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs">No logo</span>
          )}
        </div>
        <div className="flex flex-1 gap-2">
          <label className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
            {settings.logo_url ? 'Replace logo' : 'Upload logo'}
            <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
          </label>
          {settings.logo_url && (
            <button onClick={clearLogo} disabled={busy} className="rounded-md border border-neutral-200 px-3 py-2 text-xs text-neutral-600 disabled:opacity-50">
              Clear
            </button>
          )}
        </div>
      </div>

      <Field label="Shop name"><input className={inputCls} value={shopName} onChange={(e) => setShopName(e.target.value)} /></Field>
      <Field label="Hero title"><input className={inputCls} value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} /></Field>
      <Field label="Hero subtitle"><input className={inputCls} value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} /></Field>
      <p className="text-xs text-neutral-500">Tip: use <code>{'{name}'}</code> in the hero title or subtitle to insert the user&apos;s name (e.g. &quot;Welcome back {'{name}'}&quot;).</p>

      <hr className="border-neutral-200" />

      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Homepage featured story</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">When shown, appears on the home page between 6–7pm only.</p>
        </div>
        <button
          onClick={toggleFeatured}
          disabled={busy}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${featuredEnabled ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {featuredEnabled ? 'Shown' : 'Hidden'}
        </button>
      </div>

      <hr className="border-neutral-200" />

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Top banner</p>
        <button
          onClick={toggleBanner}
          disabled={busy}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${bannerEnabled ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {bannerEnabled ? 'Shown' : 'Hidden'}
        </button>
      </div>
      <Field label="Banner message"><input className={inputCls} value={bannerText} onChange={(e) => setBannerText(e.target.value)} placeholder="e.g. Free delivery this weekend!" /></Field>
      <Field label="Banner link (optional)"><input className={inputCls} value={bannerLink} onChange={(e) => setBannerLink(e.target.value)} placeholder="/games/dirty-wordle" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Banner colour">
          <div className="flex items-center gap-2">
            <span className="inline-block h-6 w-6 rounded border border-neutral-300" style={{ background: bannerBg }} />
            <input className={inputCls + ' font-mono'} value={bannerBg} onChange={(e) => setBannerBg(e.target.value)} placeholder="#0b8476" />
          </div>
        </Field>
        <Field label="Banner font colour">
          <div className="flex items-center gap-2">
            <span className="inline-block h-6 w-6 rounded border border-neutral-300" style={{ background: bannerFg }} />
            <input className={inputCls + ' font-mono'} value={bannerFg} onChange={(e) => setBannerFg(e.target.value)} placeholder="#ffffff" />
          </div>
        </Field>
      </div>

      <Field label="Sneaky countdown date & time">
        <div className="flex flex-wrap items-center gap-2">
          <input
            key={`date-${clearKey}`}
            type="date"
            className={inputCls + ' min-w-[150px] flex-1'}
            value={countdownDate}
            onChange={(e) => setCountdownDate(e.target.value)}
          />
          <input
            key={`time-${clearKey}`}
            type="time"
            className={inputCls + ' w-[110px]'}
            value={countdownTime}
            onChange={(e) => setCountdownTime(e.target.value)}
            disabled={!countdownDate}
            aria-label="Countdown target time"
          />
          {(countdownDate || countdownTime) && (
            <button
              type="button"
              onClick={() => { setCountdownDate(''); setCountdownTime(''); setClearKey((k) => k + 1); }}
              className="shrink-0 rounded-md border border-neutral-200 px-2 py-1.5 text-xs text-neutral-600"
            >
              Clear
            </button>
          )}
        </div>
      </Field>
      <p className="text-xs text-neutral-500">
        Sets a countdown in the banner (e.g. &quot;12 days to go&quot;). The live clock counts down to the
        date at the time you set — leave time blank to default to midnight. On the day itself,
        confetti falls over the home and account pages. Leave both blank for no countdown.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={saveText} disabled={busy} className="w-full rounded-md bg-amber-600 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40">
        Save branding
      </button>
    </div>
  );
}

function KatiePasswordSection() {
  const [pw, setPw]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone]   = useState(false);

  async function save() {
    if (pw.length < 6)        { setError('Password must be at least 6 characters.'); return; }
    if (pw !== confirm)       { setError('Passwords don\'t match.'); return; }
    setBusy(true); setError(null); setDone(false);
    try {
      await api.admin.changeOtherUserPassword(pw);
      setPw(''); setConfirm(''); setDone(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">Set a new password for Katie's account.</p>
      <label className="block text-xs font-medium text-neutral-600">
        New password
        <input
          type="password"
          className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setDone(false); }}
          placeholder="Min. 6 characters"
          autoComplete="new-password"
        />
      </label>
      <label className="block text-xs font-medium text-neutral-600">
        Confirm password
        <input
          type="password"
          className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setDone(false); }}
          placeholder="Repeat password"
          autoComplete="new-password"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done  && <p className="text-sm text-emerald-600">Password updated ✓</p>}
      <button
        onClick={save}
        disabled={busy || !pw || !confirm}
        className="w-full rounded-md bg-amber-600 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Update password'}
      </button>
    </div>
  );
}

function AccountSection({ account, onChanged }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [target, setTarget] = useState('');

  useEffect(() => {
    api.admin.listUsers().then((u) => {
      setUsers(u);
      const katie = u.find((x) => x.role !== 'admin');
      if (katie) setTarget(katie.id);
      else if (u[0]) setTarget(u[0].id);
    }).catch(() => {});
  }, []);

  if (!account) return null;

  async function applyCredit() {
    const n = parseInt(delta, 10);
    if (!Number.isInteger(n) || n === 0 || !reason.trim() || !target) return;
    setBusy(true); setError(null);
    try { await api.admin.creditPoints(n, reason.trim(), target); setDelta(''); setReason(''); await onChanged(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const targetName = users.find((u) => u.id === target)?.name || 'user';

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 p-3">
        <p className="text-xs uppercase tracking-wide text-amber-800">Katie's balance</p>
        <p className="text-xl font-semibold text-amber-900">{account.points_balance.toLocaleString()} pts</p>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Adjust points</p>
        <div className="flex flex-wrap items-stretch gap-2">
          <select
            className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
            value={target} onChange={(e) => setTarget(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <input
            className="block w-20 shrink-0 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
            type="number" placeholder="±"
            value={delta} onChange={(e) => setDelta(e.target.value)}
          />
          <input
            className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
            placeholder="Reason"
            value={reason} onChange={(e) => setReason(e.target.value)}
          />
          <button onClick={applyCredit} disabled={busy || !delta || !reason.trim() || !target} className="ml-auto rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40">
            Apply
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Adjusts {targetName}'s points. Positive credits, negative debits.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function ProductRow({ product, onChanged }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-neutral-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-3 text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-400">
          {product.thumbnail_url ? (
            <img src={product.thumbnail_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">
            {product.name}
            {!product.is_active && <span className="ml-2 text-xs text-neutral-400">(hidden)</span>}
          </p>
          <p className="text-xs text-neutral-500">
            {product.price_points} pts &middot; Stock {product.stock_qty} &middot; Lead {product.lead_time_days}d
          </p>
        </div>
        <span className="text-neutral-400">{open ? '\u2212' : '+'}</span>
      </button>
      {open && <ProductEditor product={product} onChanged={onChanged} />}
    </li>
  );
}

function ProductEditor({ product, onChanged }) {
  const [form, setForm] = useState({
    name: product.name,
    description: product.description ?? '',
    price_points: product.price_points,
    stock_qty: product.stock_qty,
    lead_time_days: product.lead_time_days,
    is_active: product.is_active,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function bind(field) {
    return (e) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
    };
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateProduct(product.id, {
        name: form.name,
        description: form.description || null,
        price_points: parseInt(form.price_points, 10),
        is_active: form.is_active,
      });
      await api.admin.setInventory(product.id, parseInt(form.stock_qty, 10), parseInt(form.lead_time_days, 10));
      await onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function uploadThumbnail(e) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    setBusy(true); setError(null);
    try {
      const { url } = await api.admin.upload(file);
      await api.admin.updateProduct(product.id, { thumbnail_url: url });
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function uploadGalleryMedia(e, expectedType) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    setBusy(true); setError(null);
    try {
      const { url, type } = await api.admin.upload(file);
      if (type !== expectedType) throw new Error(`Expected ${expectedType}, got ${type}`);
      await api.admin.addProductMedia(product.id, { url, media_type: type });
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function deleteMediaItem(mediaId) {
    setBusy(true); setError(null);
    try { await api.admin.deleteMedia(mediaId); await onChanged(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const media = product.media ?? [];

  return (
    <div className="space-y-3 border-t border-neutral-100 p-3">
      <Field label="Name"><input className={inputCls} value={form.name} onChange={bind('name')} /></Field>
      <Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={bind('description')} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Price"><input className={inputCls} type="number" value={form.price_points} onChange={bind('price_points')} /></Field>
        <Field label="Stock"><input className={inputCls} type="number" value={form.stock_qty} onChange={bind('stock_qty')} /></Field>
        <Field label="Lead"><input className={inputCls} type="number" value={form.lead_time_days} onChange={bind('lead_time_days')} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_active} onChange={bind('is_active')} />
        Active (visible in shop)
      </label>

      <div>
        <p className="mb-1 text-xs font-medium text-neutral-600">Gallery ({media.length})</p>
        {media.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {media.map((m) => (
              <div key={m.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                {m.media_type === 'video' ? (
                  <>
                    <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </>
                ) : (
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
                <button
                  onClick={() => deleteMediaItem(m.id)}
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold leading-none text-white"
                  aria-label="Delete media"
                >{'\u00d7'}</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <label className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
            + Image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadGalleryMedia(e, 'image')} />
          </label>
          <label className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
            + Video
            <input type="file" accept="video/*" className="hidden" onChange={(e) => uploadGalleryMedia(e, 'video')} />
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
          Replace thumbnail
          <input type="file" accept="image/*" className="hidden" onChange={uploadThumbnail} />
        </label>
        <button onClick={save} disabled={busy} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function NewProductForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sku: '', name: '', description: '', price_points: '', stock_qty: '0', lead_time_days: '0' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function bind(field) { return (e) => setForm((f) => ({ ...f, [field]: e.target.value })); }
  function reset() { setForm({ sku: '', name: '', description: '', price_points: '', stock_qty: '0', lead_time_days: '0' }); setError(null); }

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.admin.createProduct({
        sku: form.sku.trim(), name: form.name.trim(), description: form.description.trim() || null,
        price_points: parseInt(form.price_points, 10),
        stock_qty: parseInt(form.stock_qty, 10) || 0,
        lead_time_days: parseInt(form.lead_time_days, 10) || 0,
      });
      reset(); setOpen(false); await onCreated();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="block w-full rounded-xl border-2 border-dashed border-neutral-300 py-3 text-sm font-semibold text-neutral-500 hover:border-amber-500 hover:text-amber-700">
        + New product
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold">New product</p>
      <Field label="SKU"><input className={inputCls} value={form.sku} onChange={bind('sku')} placeholder="UNIQUE-CODE" /></Field>
      <Field label="Name"><input className={inputCls} value={form.name} onChange={bind('name')} /></Field>
      <Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={bind('description')} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Price"><input className={inputCls} type="number" value={form.price_points} onChange={bind('price_points')} /></Field>
        <Field label="Stock"><input className={inputCls} type="number" value={form.stock_qty} onChange={bind('stock_qty')} /></Field>
        <Field label="Lead"><input className={inputCls} type="number" value={form.lead_time_days} onChange={bind('lead_time_days')} /></Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); reset(); }} className="rounded-md px-3 py-1 text-sm text-neutral-500">Cancel</button>
        <button onClick={submit} disabled={busy || !form.sku || !form.name || !form.price_points} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function DiscountCodesSection({ codes, onChanged }) {
  return (
    <div className="space-y-3">
      {codes.length === 0 ? (
        <p className="text-sm text-neutral-500">No codes yet.</p>
      ) : (
        <ul className="space-y-2">
          {codes.map((c) => <DiscountCodeRow key={c.id} code={c} onChanged={onChanged} />)}
        </ul>
      )}
      <NewDiscountCodeForm onCreated={onChanged} />
    </div>
  );
}

function DiscountCodeRow({ code, onChanged }) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try { await api.admin.updateDiscountCode(code.id, { is_active: !code.is_active }); await onChanged(); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Delete code ${code.code}?`)) return;
    setBusy(true);
    try { await api.admin.deleteDiscountCode(code.id); await onChanged(); }
    finally { setBusy(false); }
  }

  const valueLabel =
    code.discount_type === 'percent' ? `${code.discount_value}% off` : `${code.discount_value} pts off`;
  const usesLabel = code.max_uses ? `${code.uses_count}/${code.max_uses} uses` : `${code.uses_count} uses`;

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold">
            {code.code}
            {!code.is_active && <span className="ml-2 text-xs font-normal text-neutral-400">(disabled)</span>}
          </p>
          <p className="text-xs text-neutral-500">{valueLabel} &middot; {usesLabel}</p>
          {code.description && <p className="mt-1 text-xs text-neutral-600">{code.description}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={toggle} disabled={busy} className="text-xs font-medium text-amber-700 disabled:opacity-50">
            {code.is_active ? 'Disable' : 'Enable'}
          </button>
          <button onClick={remove} disabled={busy} className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50">
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function NewDiscountCodeForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'percent', discount_value: '10',
    max_uses: '', valid_until: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function bind(f) { return (e) => setForm((s) => ({ ...s, [f]: e.target.value })); }
  function reset() {
    setForm({ code: '', description: '', discount_type: 'percent', discount_value: '10', max_uses: '', valid_until: '' });
    setError(null);
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.admin.createDiscountCode({
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: parseInt(form.discount_value, 10),
        max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
      });
      reset(); setOpen(false); await onCreated();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="block w-full rounded-xl border-2 border-dashed border-neutral-300 py-3 text-sm font-semibold text-neutral-500 hover:border-amber-500 hover:text-amber-700">
        + New code
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold">New discount code</p>
      <Field label="Code"><input className={inputCls} value={form.code} onChange={bind('code')} placeholder="SUMMER10" /></Field>
      <Field label="Description"><input className={inputCls} value={form.description} onChange={bind('description')} placeholder="(optional)" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <select className={inputCls} value={form.discount_type} onChange={bind('discount_type')}>
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed pts off</option>
          </select>
        </Field>
        <Field label={form.discount_type === 'percent' ? 'Percent' : 'Points'}>
          <input className={inputCls} type="number" value={form.discount_value} onChange={bind('discount_value')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Max uses"><input className={inputCls} type="number" value={form.max_uses} onChange={bind('max_uses')} placeholder="(optional)" /></Field>
        <Field label="Valid until"><input className={inputCls} type="datetime-local" value={form.valid_until} onChange={bind('valid_until')} /></Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); reset(); }} className="rounded-md px-3 py-1 text-sm text-neutral-500">Cancel</button>
        <button onClick={submit} disabled={busy || !form.code || !form.discount_value} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-medium text-neutral-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function OrdersAdminSection() {
  const [orders, setOrders] = useState([]);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try { setOrders(await api.admin.listAllOrders()); }
    catch (e) { console.error(e); }
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) {
    setBusyId(id);
    try { await api.admin.updateOrderStatus(id, status); await load(); }
    finally { setBusyId(null); }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Orders</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">No orders yet.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-neutral-500">#{o.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-neutral-500">{new Date(o.created_at).toLocaleString()}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {o.item_count} item{o.item_count == 1 ? '' : 's'}
                    {o.delivery_name_snapshot ? ` · ${o.delivery_name_snapshot}` : ''}
                    {o.discount_code_snapshot ? ` · ${o.discount_code_snapshot}` : ''}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-amber-700">{o.total_points} pts</p>
              </div>
              <select
                value={o.status}
                onChange={(e) => setStatus(o.id, e.target.value)}
                disabled={busyId === o.id}
                className="mt-2 block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="placed">Placed</option>
                <option value="dispatched">Dispatched</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
                <option value="deleted">Deleted</option>
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HeroSlidesAdmin() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    try { setSlides(await api.admin.listAllHeroSlides()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Hero carousel</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : (
        <>
          <ul className="space-y-2">
            {slides.map((s) => <HeroSlideRow key={s.id} slide={s} onChanged={load} />)}
          </ul>
          <NewHeroSlideForm onCreated={load} />
        </>
      )}
    </section>
  );
}

function HeroSlideRow({ slide, onChanged }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-neutral-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full gap-3 p-3 text-left">
        <div className="aspect-[16/7] w-32 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
          <img src={slide.image_url} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {slide.title || <span className="text-neutral-400">(no title)</span>}
            {!slide.is_active && <span className="ml-2 text-xs font-normal text-neutral-400">(hidden)</span>}
          </p>
          {slide.code && <p className="font-mono text-xs text-amber-700">{slide.code}</p>}
          {slide.subtitle && <p className="truncate text-xs text-neutral-500">{slide.subtitle}</p>}
        </div>
        <span className="self-center text-neutral-400">{open ? '\u2212' : '+'}</span>
      </button>
      {open && <HeroSlideEditor slide={slide} onChanged={onChanged} />}
    </li>
  );
}

function HeroSlideEditor({ slide, onChanged }) {
  const [form, setForm] = useState({
    image_url: slide.image_url,
    title: slide.title ?? '',
    subtitle: slide.subtitle ?? '',
    code: slide.code ?? '',
    is_active: slide.is_active,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function uploadImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true); setError(null);
    try {
      const { url, type } = await api.admin.upload(file);
      if (type !== 'image') throw new Error('Image required');
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateHeroSlide(slide.id, {
        image_url: form.image_url,
        title: form.title.trim() || null,
        subtitle: form.subtitle.trim() || null,
        code: form.code.trim().toUpperCase() || null,
        is_active: form.is_active,
      });
      await onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('Delete this slide?')) return;
    setBusy(true); setError(null);
    try {
      await api.admin.deleteHeroSlide(slide.id);
      await onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 border-t border-neutral-100 p-3">
      <div className="aspect-[16/7] overflow-hidden rounded-lg bg-neutral-100">
        <img src={form.image_url} alt="" className="h-full w-full object-cover" />
      </div>
      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
        Replace image
        <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
      </label>
      <Field label="Title (optional)">
        <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </Field>
      <Field label="Subtitle (optional)">
        <input className={inputCls} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
      </Field>
      <Field label="Code (optional)">
        <input className={inputCls} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="SUMMER10" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
        Active (visible in carousel)
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={remove} disabled={busy} className="text-sm text-neutral-400 hover:text-red-600 disabled:opacity-50">
          Delete
        </button>
        <button onClick={save} disabled={busy} className="ml-auto rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function NewHeroSlideForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ image_url: '', title: '', subtitle: '', code: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setForm({ image_url: '', title: '', subtitle: '', code: '' });
    setError(null);
  }

  async function uploadImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true); setError(null);
    try {
      const { url, type } = await api.admin.upload(file);
      if (type !== 'image') throw new Error('Image required');
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!form.image_url) { setError('Image required'); return; }
    setBusy(true); setError(null);
    try {
      await api.admin.createHeroSlide({
        image_url: form.image_url,
        title: form.title.trim() || null,
        subtitle: form.subtitle.trim() || null,
        code: form.code.trim().toUpperCase() || null,
      });
      reset(); setOpen(false); await onCreated();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block w-full rounded-xl border-2 border-dashed border-neutral-300 py-3 text-sm font-semibold text-neutral-500 hover:border-amber-500 hover:text-amber-700"
      >
        + New slide
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold">New slide</p>
      <div className="aspect-[16/7] overflow-hidden rounded-lg bg-neutral-100">
        {form.image_url ? (
          <img src={form.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">No image yet</div>
        )}
      </div>
      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
        {form.image_url ? 'Replace image' : 'Upload image'}
        <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
      </label>
      <Field label="Title (optional)">
        <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </Field>
      <Field label="Subtitle (optional)">
        <input className={inputCls} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
      </Field>
      <Field label="Code (optional)">
        <input className={inputCls} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="SUMMER10" />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); reset(); }} className="rounded-md px-3 py-1 text-sm text-neutral-500">Cancel</button>
        <button onClick={submit} disabled={busy || !form.image_url} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}

