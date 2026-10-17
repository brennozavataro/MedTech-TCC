/* Funções compartilhadas da programação diária (horário de Brasília). */
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
  function nextLabel(times, now = new Date()) {
    if (!times.length) return '';
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const read = type => parts.find(part => part.type === type).value;
    const current = `${read('hour')}:${read('minute')}`;
    const next = times.find(time => time >= current);
    return next ? `Próximo aviso: hoje, às ${next}.` : `Próximo aviso: amanhã, às ${times[0]}.`;
  }
  const api = { TIME_ZONE, normalizeTimes, nextLabel };
  root.MedTechSchedule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
