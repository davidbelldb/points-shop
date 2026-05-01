import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';
import ProductGallery from '../components/ProductGallery.jsx';

export default function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useBasket();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setProduct(null);
    setError(null);
    api.getProduct(id).then(setProduct).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!product) return <p className="text-sm text-neutral-500">Loading...</p>;

  const inStock = product.stock_qty > 0;

  async function handleAdd() {
    if (!inStock || adding) return;
    setAdding(true);
    try {
      await addItem(product.id, 1);
      navigate('/basket');
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-neutral-600">
        <span aria-hidden>{'\u2190'}</span> Back
      </Link>

      <ProductGallery product={product} />

      <div>
        <h1 className="text-xl font-semibold">{product.name}</h1>
        <p className="mt-1 text-lg font-semibold text-amber-700">{product.price_points} pts</p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">{product.description}</p>
      </div>

      <div className="space-y-1 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Availability</span>
          <span className={inStock ? 'font-medium text-emerald-700' : 'font-medium text-red-600'}>
            {inStock ? `${product.stock_qty} in stock` : 'Out of stock'}
          </span>
        </div>
        {product.lead_time_days > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Lead time</span>
            <span className="font-medium">
              {product.lead_time_days} day{product.lead_time_days === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      <button
        disabled={!inStock || adding}
        onClick={handleAdd}
        className="w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-amber-900 shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {adding ? 'Adding...' : inStock ? 'Add to basket' : 'Out of stock'}
      </button>
    </div>
  );
}
