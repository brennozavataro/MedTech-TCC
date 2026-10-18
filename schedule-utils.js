/* Funções compartilhadas da programação semanal (horário de Brasília). */
(function (root) {
  'use strict';
  const TIME_ZONE = 'America/Sao_Paulo';
  function normalizeTimes(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 12) {
      throw new Error('Informe entre 1 e 12 horários.');
    }
    if (values.some(value => typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
      throw new Error('Preencha todos os horários.');
    }
    if (new Set(values).size !== values.length) throw new Error('Há horários repetidos. Deixe cada horário apenas uma vez.');
    return [...values].sort();
  }
  const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  function normalizeDays(days) {
    if (!Array.isArray(days) || !days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error('Selecione pelo menos um dia da semana.');
    }
    return [...new Set(days)].sort((a, b) => a - b);
  }
  function nextLabel(times, now = new Date(), days = ALL_DAYS) {
    if (!times.length) return '';
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const read = type => parts.find(part => part.type === type).value;
    const current = `${read('hour')}:${read('minute')}`;
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(now);
    const today = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);
    for (let offset = 0; offset <= 7; offset++) {
      const day = (today + offset) % 7;
      if (!days.includes(day)) continue;
      const next = offset === 0 ? times.find(time => time >= current) : times[0];
      if (next) return 'Próximo aviso: ' + (offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : WEEKDAYS[day]) + ', às ' + next + '.';
    }
    return 'Nenhum dia programado.';
  }
  const api = { TIME_ZONE, WEEKDAYS, ALL_DAYS, normalizeDays, normalizeTimes, nextLabel };
  root.MedTechSchedule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
