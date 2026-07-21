import { describe, expect, it } from 'vitest';
import { describeAction, describeResourceType } from './labels';

describe('describeAction', () => {
  it('devuelve la etiqueta conocida para una acción del catálogo', () => {
    expect(describeAction('lote.awarded')).toEqual({ label: 'Lote adjudicado', variant: 'success' });
  });

  it('una acción desconocida cae al string crudo, sin romper', () => {
    expect(describeAction('algo.que.no.existe.todavia')).toEqual({
      label: 'algo.que.no.existe.todavia',
      variant: 'neutral',
    });
  });
});

describe('describeResourceType', () => {
  it('traduce un tipo de recurso conocido', () => {
    expect(describeResourceType('chat_message')).toBe('Mensaje de chat');
  });

  it('un tipo desconocido cae al string crudo', () => {
    expect(describeResourceType('algo_nuevo')).toBe('algo_nuevo');
  });
});
