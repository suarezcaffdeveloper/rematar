import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Reveal } from '../../../shared/components/Reveal';
import type { BenefitItem } from '../data';

export interface BenefitsSectionProps {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  benefits: BenefitItem[];
  visual: ReactNode;
  /** `true` pone el panel visual a la izquierda y el texto a la derecha, para alternar
   * el layout entre la sección del rematador y la del comprador. */
  reverse?: boolean;
  className?: string;
}

/**
 * Sección de beneficios reutilizada por rematador y comprador (`features/landing`):
 * mismo layout (texto + lista de beneficios de un lado, panel visual del otro),
 * distinto contenido -- evita duplicar la estructura dos veces.
 */
export function BenefitsSection({
  id,
  eyebrow,
  title,
  description,
  benefits,
  visual,
  reverse = false,
  className,
}: BenefitsSectionProps) {
  return (
    <section id={id} className={clsx('mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8', className)}>
      <div
        className={clsx(
          'grid grid-cols-1 items-center gap-16 lg:grid-cols-2',
          reverse && 'lg:[&>*:first-child]:order-2',
        )}
      >
        <Reveal direction={reverse ? 'none' : 'up'}>
          <span className="text-sm font-semibold uppercase tracking-wide text-brand-600">
            {eyebrow}
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600">{description}</p>

          <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <benefit.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{benefit.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{benefit.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1}>{visual}</Reveal>
      </div>
    </section>
  );
}
