// Helpers puros da visão "Ano" da aba Almoxarifado (sem DOM). Usados pelo index.html via window.ALM.
(function (global) {
    var MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    function pad2(n) { return String(n).padStart(2, '0'); }

    // Meses de janeiro até o mês de hoje (hojeISO = 'YYYY-MM-DD'); o último termina em hoje.
    function mesesDoAno(hojeISO) {
        var p = String(hojeISO).split('-').map(Number);
        var ano = p[0], mesHoje = p[1], diaHoje = p[2];
        var lista = [];
        for (var m = 1; m <= mesHoje; m++) {
            var ultimoDia = new Date(ano, m, 0).getDate();
            var fim = m === mesHoje ? diaHoje : ultimoDia;
            lista.push({ mes: ano + '-' + pad2(m), inicio: ano + '-' + pad2(m) + '-01', fim: ano + '-' + pad2(m) + '-' + pad2(fim) });
        }
        return lista;
    }

    // '2026-03' -> 'mar/26'
    function rotuloMes(mes) {
        var p = String(mes).split('-');
        return MESES_CURTOS[Number(p[1]) - 1] + '/' + p[0].slice(-2);
    }

    // Ponto do gráfico mensal, no mesmo formato da série diária que o n8n já devolve.
    function pontoMensal(mes, current) {
        var c = current || {};
        var it = c.itens || {}, pc = c.pecas || {}, vl = c.valor || {};
        return {
            date: mes,
            itensContados: it.contados || 0,
            itensDivPositiva: it.divPositiva || 0,
            itensDivNegativa: it.divNegativa || 0,
            itensAcuracidadePct: it.acuracidadePct || 0,
            pecasDivPositiva: pc.divPositiva || 0,
            pecasDivNegativa: pc.divNegativa || 0,
            pecasAcuracidadePct: pc.acuracidadePct || 0,
            valorDivPositiva: vl.ajustePositivo || 0,
            valorDivNegativa: vl.ajusteNegativo || 0,
            valorAcuracidadePct: vl.acuracidadePct || 0
        };
    }

    global.ALM = { mesesDoAno: mesesDoAno, rotuloMes: rotuloMes, pontoMensal: pontoMensal };
})(typeof window !== 'undefined' ? window : globalThis);
