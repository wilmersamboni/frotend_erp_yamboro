import { crearLog } from './log';

describe('log', () => {
  let error: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let consola: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consola = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('en desarrollo escribe todo', () => {
    const log = crearLog(false);

    log.error('e', 1);
    log.warn('w');
    log.debug('d');

    expect(error).toHaveBeenCalledWith('e', 1);
    expect(warn).toHaveBeenCalledWith('w');
    expect(consola).toHaveBeenCalledWith('d');
  });

  it('en producción solo quedan los errores', () => {
    const log = crearLog(true);

    log.error('e');
    log.warn('w');
    log.debug('d');

    expect(error).toHaveBeenCalledWith('e');
    expect(warn).not.toHaveBeenCalled();
    expect(consola).not.toHaveBeenCalled();
  });
});
