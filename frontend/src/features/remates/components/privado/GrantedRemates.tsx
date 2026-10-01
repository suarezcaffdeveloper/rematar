import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { useLoteCount } from '../../hooks';
import { STATUS_LABELS } from '../../labels';
import type { Remate } from '../../types';
import { formatSchedule } from '../home/homeDates';
import { LiveDot } from '../home/LiveDot';
import { RemateCover } from '../home/RemateCover';

const SKELETON_COUNT = 3;

export interface GrantedRematesProps {
  remates: Remate[];
  isLoading: boolean;
}

/**
 * "Tus remates privados": los remates a los que el usuario YA canjeó antes
 * (`useMyPrivateAccessGrants`, `GET /remates/private/mine`) como una tira de fotos que se
 * desliza. Si perdió la sesión o cerró la pestaña sin guardar la URL, el grant
 * (`RemateAccessGrant`) sigue vigente y acá puede volver a entrar sin pegar el código: el
 * detalle funciona directo gracias al grant.
 */
export function GrantedRemates({ remates, isLoading }: GrantedRematesProps) {
  return (
    <section aria-labelledby="remates-privados" className="mt-24 pb-20">
      <h2 id="remates-privados" className="text-2xl font-semibold tracking-tight">
        Tus remates privados
      </h2>
      <p className="mb-6 mt-1 text-ink-muted">Ya entraste a estos: volvé a entrar sin pegar el código de nuevo.</p>
      <ul className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isLoading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <li key={i} className="snap-start">
                <Skeleton className="h-[22rem] w-[16.5rem] rounded-2xl sm:w-[18rem]" />
              </li>
            ))
          : remates.map((remate) => (
              <li key={remate.id} className="snap-start">
                <GrantedTile remate={remate} />
              </li>
            ))}
      </ul>
    </section>
  );
}

function GrantedTile({ remate }: { remate: Remate }) {
  const loteCount = useLoteCount(remate.id);

  return (
    <Link
      to={`/remates/${remate.id}`}
      className="group relative block h-[22rem] w-[16.5rem] overflow-hidden rounded-2xl bg-ink text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:w-[18rem]"
    >
      <RemateCover
        remate={remate}
        className="absolute inset-0 h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
      <p className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink backdrop-blur">
        {remate.status === 'live' ? (
          <>
            <LiveDot /> En vivo
          </>
        ) : remate.status === 'scheduled' && remate.starts_at ? (
          <span className="tabular-nums">{formatSchedule(remate.starts_at)}</span>
        ) : (
          STATUS_LABELS[remate.status]
        )}
      </p>
      <div className="absolute inset-x-0 bottom-0 p-5">
        <p className="text-balance text-xl font-semibold leading-tight tracking-tight">{remate.title}</p>
        <p className="mt-1.5 flex items-center justify-between text-sm text-white/75">
          <span>{loteCount === null ? '' : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`}</span>
          <ArrowRight
            className="h-5 w-5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
            aria-hidden="true"
          />
        </p>
      </div>
    </Link>
  );
}
