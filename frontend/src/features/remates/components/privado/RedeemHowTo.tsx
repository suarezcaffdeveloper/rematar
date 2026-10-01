import { REDEEM_STEPS } from '../../privateAccess';

/** "Cómo conseguir el acceso": los tres pasos del canje como línea de tiempo, en segundo
 * plano al costado del formulario. */
export function RedeemHowTo() {
  return (
    <aside aria-labelledby="como-conseguir" className="lg:pt-2">
      <h2 id="como-conseguir" className="text-lg font-semibold tracking-tight">
        Cómo conseguir el acceso
      </h2>
      <ol className="mt-5 border-t border-ink pt-6">
        {REDEEM_STEPS.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-4">
            <div className="flex flex-col items-center">
              <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 rounded-full bg-ink" />
              {index < REDEEM_STEPS.length - 1 && <span aria-hidden="true" className="my-1 w-px flex-1 bg-line-strong" />}
            </div>
            <div className={index < REDEEM_STEPS.length - 1 ? 'pb-6' : ''}>
              <p className="font-medium">{step.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
