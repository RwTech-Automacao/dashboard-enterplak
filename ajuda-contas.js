// Painel "Como calculamos" (botão ? da barra superior).
// Cada aba tem um montador que lê o estado AO VIVO da tela (dados já carregados + filtros)
// e explica cada cartão, um embaixo do outro, com a conta de CADA número que o cartão mostra
// (valor principal, % / seta de variação, meta...). Não busca nada novo.
// As variáveis da tela (allData, faturamentoData, almState...) são globais do index.html.
(function (global) {
    // ---------- formatação ----------
    function num(v, dec) {
        var n = Number(v) || 0;
        return n.toLocaleString('pt-BR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
    }
    function brl(v, dec) { return 'R$ ' + num(v, dec === undefined ? 2 : dec); }
    function pct(v, dec) { return num(v, dec === undefined ? 1 : dec) + '%'; }
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function dataBR(v) {
        if (!v) return '—';
        if (v instanceof Date) return ('0' + v.getDate()).slice(-2) + '/' + ('0' + (v.getMonth() + 1)).slice(-2) + '/' + v.getFullYear();
        var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? m[3] + '/' + m[2] + '/' + m[1] : String(v);
    }

    // ---------- blocos ----------
    function p(t) { return '<p>' + t + '</p>'; }
    function conta(t) { return '<div class="ajuda-conta">' + t + '</div>'; }
    function nota(t) { return '<p class="ajuda-nota">' + t + '</p>'; }
    function lista(itens) { return '<ul>' + itens.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'; }
    function res(t) { return '<span class="ajuda-res">' + t + '</span>'; }
    function filtro(t) { return '<div class="ajuda-filtro">' + t + '</div>'; }
    function grupo(t) { return '<div class="ajuda-grupo">' + esc(t) + '</div>'; }
    function secao(titulo, corpo) { return '<div class="ajuda-secao"><h4>' + esc(titulo) + '</h4>' + corpo + '</div>'; }
    function semDados(t) { return p(t || 'Os dados desta tela ainda não carregaram. Abra a aba, espere carregar e clique no ? de novo.'); }

    // Um cartão da tela: rótulo + valor como aparece, e um item por número mostrado no cartão.
    // itens: [{ nome, texto (opcional), conta (opcional) }]
    function card(rotulo, valor, itens) {
        var h = '<div class="ajuda-card"><div class="ajuda-card-topo"><span class="ajuda-card-rotulo">' + esc(rotulo) +
            '</span><span class="ajuda-card-valor">' + valor + '</span></div>';
        (itens || []).forEach(function (i) {
            if (!i) return;
            h += '<div class="ajuda-item"><div class="ajuda-item-nome">' + i.nome + '</div>' +
                (i.texto ? '<div>' + i.texto + '</div>' : '') + (i.conta ? conta(i.conta) : '') + '</div>';
        });
        return h + '</div>';
    }

    // Lê uma variável global da tela pelo nome. As declaradas com let no index.html não ficam
    // em window, mas o corpo de new Function enxerga o escopo global inteiro. Nomes são fixos daqui.
    function ler(nome) {
        try { return new Function('return typeof ' + nome + " === 'undefined' ? undefined : " + nome)(); }
        catch (e) { return undefined; }
    }

    // Dias úteis (seg–sex, sem feriados) — mesma regra da tela
    function diasUteis(ini, fim, ate) {
        var total = 0, ateHoje = 0;
        for (var d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
            var w = d.getDay();
            if (w !== 0 && w !== 6) { total++; if (d <= ate) ateHoje++; }
        }
        return { total: total, ateHoje: ateHoje };
    }

    var montadores = {};

    // =====================================================================
    // COMPRAS (aba "dashboard")
    // =====================================================================
    montadores.dashboard = function () {
        var all = ler('allData') || [], fil = ler('filteredData') || [];
        if (!all.length) return semDados();
        function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
        var f = [];
        if (val('filterEmbarque')) f.push('Embarque <b>' + esc(val('filterEmbarque')) + '</b>');
        if (val('filterResponsavel')) f.push('Responsável <b>' + esc(val('filterResponsavel')) + '</b>');
        if (val('filterProjeto')) f.push('Projeto <b>' + esc(val('filterProjeto')) + '</b>');
        if (val('filterDataDe') || val('filterDataAte')) f.push('Data de embarque de <b>' + dataBR(val('filterDataDe')) + '</b> até <b>' + dataBR(val('filterDataAte')) + '</b>');

        var cont = {};
        fil.forEach(function (d) { cont[d['Status']] = (cont[d['Status']] || 0) + 1; });
        var tot = fil.length, ok = cont['OK'] || 0, pend = cont['RESPOSTA PENDENTE'] || 0, prob = cont['PROBLEMA NO PRAZO'] || 0;
        var outros = tot - ok - pend - prob;
        function pp(v) { return (tot ? (v / tot * 100) : 0).toFixed(1) + '%'; } // igual à tela

        var h = filtro('<b>Base:</b> planilha de pedidos de compra (via n8n). ' +
            'Linhas na planilha: <b>' + num(all.length) + '</b> · depois dos filtros: <b>' + num(tot) + '</b>.<br>' +
            (f.length ? 'Filtros ativos: ' + f.join(' · ') : 'Nenhum filtro ativo.') +
            (val('filterDataDe') || val('filterDataAte') ? '<br>Com filtro de data, pedidos <b>sem data de embarque</b> ficam de fora.' : ''));

        function cardStatus(rotulo, status, v) {
            return card(rotulo, num(v), [
                { nome: 'Quantidade', texto: 'Pedidos com o texto exato <b>' + esc(status) + '</b> na coluna Status.', conta: '= ' + res(num(v)) },
                { nome: '% do total', conta: num(v) + ' ÷ ' + num(tot) + ' × 100 = ' + res(pp(v)) }
            ]);
        }
        h += grupo('Cartões');
        h += card('Total de Pedidos', num(tot), [{ nome: 'Quantidade', texto: 'Linhas da planilha que passaram nos filtros.', conta: '= ' + res(num(tot)) }]);
        h += cardStatus('OK', 'OK', ok);
        h += cardStatus('Resposta Pendente', 'RESPOSTA PENDENTE', pend);
        h += cardStatus('Alerta de Problema', 'PROBLEMA NO PRAZO', prob);
        if (outros > 0) h += nota('<b>' + num(outros) + '</b> pedido(s) têm outro status (ex.: "NENHUMA RESPOSTA" ou vazio). Entram no Total, mas em nenhum dos 3 cartões — por isso os % não somam 100%.');

        h += grupo('Gráficos e tabela');
        h += lista([
            '<b>Por Embarque:</b> os ' + num(prob) + ' pedidos com Alerta de Problema, agrupados pela coluna Embarque (ou pelo código EMB do Fornecedor). Pedido sem embarque não aparece.',
            '<b>Por Responsável:</b> os mesmos pedidos, agrupados pela coluna Responsável.',
            '<b>Histórico — últimos 7 dias:</b> vem pronto da aba "histórico de alertas" da planilha (as 7 últimas linhas). <b>Não muda com os filtros.</b>',
            '<b>Tabela:</b> os ' + num(prob) + ' pedidos com Alerta de Problema, do embarque mais recente para o mais antigo.'
        ]);
        return { titulo: 'Compras', sub: 'Status de pedidos e alertas de problema', html: h };
    };

    // =====================================================================
    // LOGÍSTICA
    // =====================================================================
    montadores.logistica = function () {
        var resumo = ler('logisticaSummary') || [];
        if (!resumo.length) return semDados();
        var h = filtro('<b>Base:</b> uma planilha por embarque (via n8n). Sem filtros: aparecem todos os embarques que o n8n devolve (' + num(resumo.length) + ').<br>' +
            'Só contam como item as linhas com <b>Número</b> do pedido e <b>Código</b> preenchidos.');

        resumo.forEach(function (e) {
            var rec = e.itensRecebidos || 0, tot = e.totalItens || 0;
            var ref = e.bookingDate || e.prazoDate, refNome = e.bookingDate ? 'Booking' : 'Prazo';
            var stRef = e.prazoDate ? 'Prazo' : (e.bookingDate ? 'Booking' : null);
            var sufixo = /EA$/i.test(e.nome) ? 'termina em EA (EUA)' : (/(CA|CM)$/i.test(e.nome) ? 'termina em CA/CM (China)' : 'demais embarques');
            h += grupo(e.nome);
            h += card('Total de itens', num(tot), [{ nome: 'Quantidade', texto: 'Linhas do embarque com pedido e código.', conta: '= ' + res(num(tot)) }]);
            h += card('Itens recebidos', num(rec), [{ nome: 'Quantidade', texto: 'Itens com "Data de entrega do item" preenchida.', conta: '= ' + res(num(rec)) }]);
            h += card('% restante de itens', pct(e.pctRestante || 0, 2), [{ nome: 'Porcentagem', texto: 'Itens que ainda não chegaram, sobre o total.',
                conta: '(' + num(tot) + ' − ' + num(rec) + ') ÷ ' + num(tot) + ' × 100 = ' + res(pct(e.pctRestante || 0, 2)) }]);
            h += card('Itens c/ entrega crítica', num(e.itensCriticos || 0), [{ nome: 'Quantidade',
                texto: 'Itens ainda não recebidos com "Data prevista para entrega do item" a <b>' + e.threshold + ' dias ou menos</b> do ' + refNome +
                    ' (limite de ' + e.threshold + ' dias porque o código ' + sufixo + '). Item previsto para depois do embarque também conta.',
                conta: ref ? refNome + ' ' + dataBR(ref) + ' → ' + res(num(e.itensCriticos || 0)) + ' item(ns)' : 'Sem Booking nem Prazo: não calcula (0).' }]);
            h += card('Status', esc(e.status && e.status.label || '—'), [{ nome: 'Regra',
                texto: 'Dias até o ' + (stRef || 'Prazo') + ': menos de 7 = Próximo do embarque (vermelho); menos de 30 = Ajustes (amarelo); 30 ou mais = Planejamento (verde); sem data = SEM DATA.',
                conta: stRef && e.diasAte !== null && !isNaN(e.diasAte) ? stRef + ' ' + dataBR(stRef === 'Prazo' ? e.prazoDate : e.bookingDate) + ' → faltam ' + res(num(e.diasAte) + ' dias') : 'Sem data de Prazo nem Booking.' }]);
            h += card('Contagem regressiva', e.concluido ? 'Concluído' : (e.emTransito ? 'Em trânsito' : (ref ? 'até ' + dataBR(ref) : '—')), [{ nome: 'Regra',
                texto: e.concluido ? 'A coluna "Embarque Concluído" está preenchida.' :
                    (e.emTransito ? 'A coluna "Carga em trânsito" começa com S (Sim).' :
                        'Tempo até o ' + refNome + '. Quando passa da data e o embarque não foi marcado como concluído, pisca "Embarque não aconteceu?".') }]);
            if (e.bookingDate && e.prazoDate && e.bookingDate > e.prazoDate) h += nota('O Prazo pisca porque o Booking (' + dataBR(e.bookingDate) + ') está depois do Prazo (' + dataBR(e.prazoDate) + ').');
        });
        return { titulo: 'Logística', sub: 'Status de cada embarque', html: h };
    };

    // =====================================================================
    // PRODUÇÃO (aba "faturamento")
    // =====================================================================
    function mesSelecionado() {
        var mesAtual = ler('faturamentoMesAtual');
        var nomes = ler('MESES_NOMES') || [];
        if (!mesAtual) return null;
        var partes = String(mesAtual).split('/');
        var mes = nomes.indexOf((partes[0] || '').toLowerCase()) + 1;
        if (mes < 1) return null;
        return { param: mesAtual, mes: mes, ano: 2000 + parseInt(partes[1] || '0', 10), yy: partes[1],
            label: partes[0].charAt(0).toUpperCase() + partes[0].slice(1) + '/' + partes[1] };
    }

    function diffPP(a, b) { var d = a - b; return (d >= 0 ? '+' : '') + num(d, 1) + ' p.p.'; }

    montadores.faturamento = function () {
        var data = ler('faturamentoData'), m = mesSelecionado();
        if (!data || !m) return semDados();
        if (data.error) return semDados('A tela mostrou erro ao carregar: ' + esc(data.error));

        var hoje = new Date();
        var du = diasUteis(new Date(m.ano, m.mes - 1, 1), new Date(m.ano, m.mes, 0), hoje);
        var duHoje = du.ateHoje;
        if (new Date(m.ano, m.mes, 0) < hoje) duHoje = du.total;
        if (new Date(m.ano, m.mes - 1, 1) > hoje) duHoje = 0;
        var pctMeta = du.total ? duHoje / du.total * 100 : 0;
        var sel = ler('faturamentoProjetoSelecionado');

        var h = filtro('<b>Base:</b> Kanban PRO — entregas planejadas e notas fiscais dos cards de venda.<br>' +
            'Mês selecionado: <b>' + esc(m.label) + '</b>' + (sel ? ' · Cliente selecionado: <b>' + esc(sel) + '</b> (muda só o gráfico)' : '') + '.<br>' +
            'Entram só as entregas planejadas e as notas <b>com data dentro desse mês</b>. "Produzido" = <b>quantidade das notas</b> lançadas no Kanban.<br>' +
            'Dias úteis (seg–sex, <b>feriados não são descontados</b>; hoje já conta): <b>' + duHoje + ' de ' + du.total + '</b>.');

        function cardsProducao(rotulo, x, completo) {
            var pctProd = x.metaProducao > 0 ? x.producao / x.metaProducao * 100 : 0;
            var metaHojeQtd = du.total ? x.metaProducao / du.total * duHoje : 0;
            var noPrazo = x.producao >= metaHojeQtd;
            var pctFat = x.metaFaturamento > 0 ? x.faturado / x.metaFaturamento * 100 : 0;
            return card(rotulo, pct(pctProd) + ' produzido', [
                { nome: '% produzido (barra)', texto: 'Peças faturadas ÷ peças com entrega planejada no mês.',
                  conta: num(x.producao) + ' ÷ ' + num(x.metaProducao) + ' × 100 = ' + res(pct(pctProd)) },
                { nome: 'Meta hoje (traço na barra)', texto: completo ? 'Linha reta: o mês dividido igualmente pelos dias úteis.' : null,
                  conta: duHoje + ' ÷ ' + du.total + ' dias úteis = ' + res(pct(pctMeta)) + '\nEm peças: ' + num(x.metaProducao) + ' ÷ ' + du.total + ' × ' + duHoje + ' = ' + res(num(metaHojeQtd)) },
                { nome: 'Selo ' + (noPrazo ? 'NO PRAZO' : 'ATRASADO'),
                  texto: completo ? 'Compara as peças faturadas com a meta de hoje. <b>Não olha a data prevista de cada entrega</b>: se tudo está planejado para o fim do mês, pode aparecer ATRASADO sem nada vencido.' : null,
                  conta: num(x.producao) + (noPrazo ? ' ≥ ' : ' < ') + num(metaHojeQtd) + ' → ' + res(noPrazo ? 'NO PRAZO' : 'ATRASADO') },
                { nome: 'Diferença', conta: num(pctProd, 1) + '% − ' + num(pctMeta, 1) + '% = ' + res(diffPP(pctProd, pctMeta)) },
                { nome: completo ? 'Faturamento real' : 'FAT',
                  texto: completo ? 'Valor das notas ÷ valor das entregas planejadas, em reais. Entrega = (valor fixo + câmbio do pedido × valor variável) × quantidade; nota = mesmo cálculo com o câmbio da nota. Pode diferir do % produzido porque peças caras e baratas pesam igual em quantidade, mas não em valor.' : null,
                  conta: brl(x.faturado) + ' ÷ ' + brl(x.metaFaturamento) + ' × 100 = ' + res(pct(pctFat)) }
            ]);
        }

        h += grupo(m.label + ' — Meta geral de produção');
        h += cardsProducao('Produção do mês (empresa toda)', data, true);
        h += secao('Gráfico "Evolução do faturamento no mês"',
            p('Em <b>reais</b>, acumulado dia a dia: soma das notas até o dia ÷ valor planejado do mês' + (sel ? ' do cliente ' + esc(sel) : '') +
              '. A linha tracejada é a meta em linha reta (só sobe em dia útil). Verde se o realizado está acima da linha no último dia, vermelho se abaixo.'));

        var projs = data.projetos || [];
        if (projs.length) {
            h += grupo('Por projeto (cliente)');
            h += nota('Mesmas contas, só com as entregas e notas de cada cliente.');
            projs.forEach(function (pj) { h += cardsProducao(pj.nome, pj, false); });
        }
        return { titulo: 'Produção e Faturamento', sub: m.label, html: h };
    };

    // =====================================================================
    // VENDAS
    // =====================================================================
    montadores.vendas = function () {
        var m = mesSelecionado(), porMes = ler('vendasTrimestre') || {};
        var META = ler('META_VENDAS_TRIMESTRE') || 0, nomes = ler('MESES_NOMES') || [];
        if (!m) return semDados();
        var trim = Math.ceil(m.mes / 3), meses = [3 * trim - 2, 3 * trim - 1, 3 * trim];
        var hoje = new Date(), ini = new Date(m.ano, (trim - 1) * 3, 1), fim = new Date(m.ano, trim * 3, 0);
        var du = diasUteis(ini, fim, hoje), duHoje = du.ateHoje;
        if (fim < hoje) duHoje = du.total;
        if (ini > hoje) duHoje = 0;
        var pctMeta = du.total ? duHoje / du.total * 100 : 0;
        var metaMes = META / 3;
        var real = 0;
        meses.forEach(function (mm) { real += porMes[nomes[mm - 1] + '/' + m.yy] || 0; });
        var pctTrim = META ? real / META * 100 : 0;
        var noPrazo = pctTrim >= pctMeta;
        var selMes = ler('vendasMesSelecionado');

        var h = filtro('<b>Base:</b> Kanban PRO — cards de prospecção marcados como <b>Ganho</b>, só pedidos em <b>reais (BRL)</b>.<br>' +
            'Cada venda entra no mês da <b>data de aprovação</b>. Trimestre: <b>' + trim + 'º/' + esc(m.yy) + '</b> (definido pelo mês selecionado, ' + esc(m.label) + ').' +
            (selMes ? '<br>Mês clicado: <b>' + esc(selMes) + '</b> (muda só o gráfico).' : '') +
            '<br>A tela mostra só %; os valores em reais aparecem aqui.');

        h += grupo('Trimestre');
        h += card('Meta de vendas do trimestre', pct(pctTrim) + ' da meta', [
            { nome: '% da meta (barra)', texto: 'Vendas aprovadas nos 3 meses ÷ meta fixa do trimestre.', conta: brl(real, 0) + ' ÷ ' + brl(META, 0) + ' × 100 = ' + res(pct(pctTrim)) },
            { nome: 'Meta hoje (traço na barra)', texto: 'Linha reta pelos dias úteis do trimestre (seg–sex, sem feriados).', conta: duHoje + ' ÷ ' + du.total + ' dias úteis = ' + res(pct(pctMeta)) },
            { nome: 'Selo ' + (noPrazo ? 'NO PRAZO' : 'ATRASADO'), conta: num(pctTrim, 1) + '% ' + (noPrazo ? '≥' : '<') + ' ' + num(pctMeta, 1) + '% → ' + res(noPrazo ? 'NO PRAZO' : 'ATRASADO') },
            { nome: 'Diferença', conta: num(pctTrim, 1) + '% − ' + num(pctMeta, 1) + '% = ' + res(diffPP(pctTrim, pctMeta)) }
        ]);

        h += grupo('Por mês — meta mensal = 1/3 do trimestre (' + brl(metaMes, 0) + ')');
        meses.forEach(function (mm) {
            var v = porMes[nomes[mm - 1] + '/' + m.yy] || 0, pm = metaMes ? v / metaMes * 100 : 0, esperado, como;
            if (mm < m.mes) { esperado = 100; como = 'mês antes do selecionado → 100%'; }
            else if (mm > m.mes) { esperado = 0; como = 'mês depois do selecionado → 0%'; }
            else {
                var dm = diasUteis(new Date(m.ano, mm - 1, 1), new Date(m.ano, mm, 0), hoje);
                esperado = dm.total ? dm.ateHoje / dm.total * 100 : 0;
                como = dm.ateHoje + ' ÷ ' + dm.total + ' dias úteis';
            }
            var ok = pm >= esperado;
            var nomeMes = nomes[mm - 1].charAt(0).toUpperCase() + nomes[mm - 1].slice(1);
            h += card(nomeMes, pct(pm) + ' da meta', [
                { nome: '% da meta', conta: brl(v, 0) + ' ÷ ' + brl(metaMes, 0) + ' × 100 = ' + res(pct(pm)) },
                { nome: 'Meta esperada', conta: como + ' = ' + res(pct(esperado)) },
                { nome: 'Selo ' + (ok ? 'NO PRAZO' : 'ATRASADO') + ' e diferença', conta: num(pm, 1) + '% ' + (ok ? '≥' : '<') + ' ' + num(esperado, 1) + '% → ' + res(ok ? 'NO PRAZO' : 'ATRASADO') + ' (' + diffPP(pm, esperado) + ')' }
            ]);
        });
        h += secao('Gráfico "Evolução das vendas"',
            p('Vendas acumuladas dia a dia ÷ meta do período (trimestre inteiro, ou 1/3 se um mês estiver clicado), contra a linha reta de dias úteis.'));
        return { titulo: 'Vendas', sub: 'Trimestre ' + trim + 'º/' + m.yy, html: h };
    };

    // =====================================================================
    // ALMOXARIFADO
    // =====================================================================
    var ALM_PRESETS = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', 'mes_atual': 'Mês atual',
        'mes_anterior': 'Mês anterior', 'ano': 'Ano (01/01 até hoje)', 'custom': 'Período personalizado' };

    // Mesma regra do selo de variação da tela (almVariation/almVarBadge)
    function variacao(cur, prev, invertido, fmt) {
        cur = Number(cur) || 0;
        var pctV, dir;
        if (prev === 0 || prev === null || prev === undefined) {
            pctV = cur > 0 ? 100 : 0;
            dir = cur > 0 ? (invertido ? 'down' : 'up') : 'neutral';
        } else {
            pctV = (cur - prev) / Math.abs(prev) * 100;
            dir = pctV > 0.05 ? (invertido ? 'down' : 'up') : (pctV < -0.05 ? (invertido ? 'up' : 'down') : 'neutral');
        }
        var selo = (dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●') + ' ' + (pctV > 0 ? '+' : '') + pctV.toFixed(1) + '%';
        var cor = dir === 'up' ? 'verde (melhorou)' : dir === 'down' ? 'vermelho (piorou)' : 'cinza (igual)';
        var c = (prev === 0 || prev === null || prev === undefined)
            ? 'No período anterior era 0' + (cur > 0 ? ' → a tela mostra +100%' : ' e agora também → 0%')
            : '(' + fmt(cur) + ' − ' + fmt(prev) + ') ÷ ' + fmt(Math.abs(prev)) + ' × 100 = ' + res((pctV > 0 ? '+' : '') + num(pctV, 1) + '%');
        return { nome: 'Selo ' + esc(selo) + ' — ' + cor,
            texto: 'Compara com o período anterior.' + (invertido ? ' Aqui <b>menos é melhor</b>: cair fica verde.' : ''),
            conta: c };
    }

    montadores.almoxarifado = function () {
        var st = ler('almState');
        if (!st || !st.data || !st.data.current) return semDados();
        var d = st.data, c = d.current, it = c.itens || {}, pc = c.pecas || {}, vl = c.valor || {};
        var pv = d.modoAno ? {} : (d.previous || {});
        var pIt = pv.itens || {}, pPc = pv.pecas || {}, pVl = pv.valor || {};
        var comparar = !d.modoAno && !!d.previous;
        var dias = (d.period && d.period.days) || 0;
        var almMeta = ler('almMetaMensal');
        var metaMensal = typeof almMeta === 'function' ? almMeta() : 0;
        var meta = metaMensal * dias / 30;
        var ating = meta > 0 ? (it.contados || 0) / meta * 100 : 0;
        function n0(v) { return num(v); }
        function r2(v) { return brl(v); }
        function p2(v) { return pct(v, 2); }
        function vari(cur, prev, inv, fmt) { return comparar ? variacao(cur, prev, inv, fmt) : null; }

        var h = filtro('<b>Base:</b> planilha "Tabela oficial do inventário rotativo" (via n8n).<br>' +
            'Período: <b>' + esc(ALM_PRESETS[st.activePreset] || st.activePreset) + '</b> — ' + dataBR(st.startDate) + ' a ' + dataBR(st.endDate) + ' (' + dias + ' dias).<br>' +
            'Estoque: <b>' + esc(st.estoque || 'Todos') + '</b> (coluna ESTOQUE).<br>' +
            'Cada linha da planilha com <b>MÊS DA CONTAGEM</b> dentro do período = 1 item contado. Linhas com a data fora do formato dd/mm/aaaa são <b>ignoradas</b>.<br>' +
            'Diferença de cada linha = <b>QTDE NO FÍSICO − QTDE ATUAL NO SISTEMA</b>: maior que 0 = divergência positiva (sobra); menor que 0 = negativa (falta); 0 = sem divergência.' +
            (comparar ? '<br>Selos ▲▼: comparação com o mesmo número de dias logo antes, de <b>' + dataBR(d.previousPeriod && d.previousPeriod.startDate) + ' a ' + dataBR(d.previousPeriod && d.previousPeriod.endDate) + '</b>.'
                : '<br>Visão do ano: não há comparação com período anterior (sem selos ▲▼).'));

        // ---- Itens ----
        h += grupo('Itens (SKUs)');
        h += card('Itens contados', n0(it.contados), [
            { nome: 'Quantidade', texto: 'Linhas da planilha contadas no período.', conta: '= ' + res(n0(it.contados)) },
            vari(it.contados, pIt.contados, false, n0),
            { nome: 'Meta e % da meta (linha de baixo e barra)', texto: 'Meta mensal (' + (st.estoque ? 'do estoque filtrado' : 'Meta PA + Meta MP') + ') proporcional aos dias do período. Barra verde a partir de 100%, amarela a partir de 70%, vermelha abaixo.',
              conta: 'Meta: ' + num(metaMensal) + ' ÷ 30 × ' + dias + ' = ' + res(num(Math.round(meta))) + '\n% da meta: ' + n0(it.contados) + ' ÷ ' + num(meta, 1) + ' × 100 = ' + res(pct(ating)) }
        ]);
        h += card('Sem divergências', n0(it.semDivergencia), [
            { nome: 'Quantidade', texto: 'Linhas com diferença 0 (físico = sistema).', conta: '= ' + res(n0(it.semDivergencia)) },
            vari(it.semDivergencia, pIt.semDivergencia, false, n0)
        ]);
        h += card('Divergências positivas', n0(it.divPositiva), [
            { nome: 'Quantidade', texto: 'Linhas com mais peças no físico que no sistema (sobra). Clique no cartão para ver a lista.', conta: '= ' + res(n0(it.divPositiva)) },
            vari(it.divPositiva, pIt.divPositiva, true, n0)
        ]);
        h += card('Divergências negativas', n0(it.divNegativa), [
            { nome: 'Quantidade', texto: 'Linhas com menos peças no físico que no sistema (falta). Clique no cartão para ver a lista.', conta: '= ' + res(n0(it.divNegativa)) },
            vari(it.divNegativa, pIt.divNegativa, true, n0)
        ]);
        h += card('Ajuste absoluto', n0(it.ajusteAbsoluto), [
            { nome: 'Quantidade', texto: 'Total de linhas com divergência, positiva ou negativa.', conta: n0(it.divPositiva) + ' + ' + n0(it.divNegativa) + ' = ' + res(n0(it.ajusteAbsoluto)) },
            vari(it.ajusteAbsoluto, pIt.ajusteAbsoluto, true, n0)
        ]);
        h += card('Acuracidade', p2(it.acuracidadePct), [
            { nome: 'Porcentagem', texto: 'Linhas sem divergência ÷ linhas contadas. Verde a partir de 95%, laranja a partir de 80%, vermelho abaixo.',
              conta: n0(it.semDivergencia) + ' ÷ ' + n0(it.contados) + ' × 100 = ' + res(p2(it.acuracidadePct)) },
            vari(it.acuracidadePct, pIt.acuracidadePct, false, p2)
        ]);

        // ---- Peças ----
        h += grupo('Peças (quantidade)');
        h += card('Peças no sistema', n0(pc.sistema), [
            { nome: 'Quantidade', texto: 'Soma da coluna QTDE ATUAL NO SISTEMA das linhas contadas.', conta: '= ' + res(n0(pc.sistema)) },
            vari(pc.sistema, pPc.sistema, false, n0)
        ]);
        h += card('Peças contadas', n0(pc.contadas), [
            { nome: 'Quantidade', texto: 'Soma da coluna QTDE NO FÍSICO das linhas contadas.', conta: '= ' + res(n0(pc.contadas)) },
            vari(pc.contadas, pPc.contadas, false, n0)
        ]);
        h += card('Divergências positivas', n0(pc.divPositiva), [
            { nome: 'Quantidade', texto: 'Soma das peças a mais (diferença) nas linhas com sobra.', conta: '= ' + res(n0(pc.divPositiva)) + ' peças' },
            vari(pc.divPositiva, pPc.divPositiva, true, n0)
        ]);
        h += card('Divergências negativas', n0(pc.divNegativa), [
            { nome: 'Quantidade', texto: 'Soma das peças a menos nas linhas com falta (sem o sinal).', conta: '= ' + res(n0(pc.divNegativa)) + ' peças' },
            vari(pc.divNegativa, pPc.divNegativa, true, n0)
        ]);
        h += card('Ajuste absoluto', n0(pc.ajusteAbsoluto), [
            { nome: 'Quantidade', conta: n0(pc.divPositiva) + ' + ' + n0(pc.divNegativa) + ' = ' + res(n0(pc.ajusteAbsoluto)) + ' peças' },
            vari(pc.ajusteAbsoluto, pPc.ajusteAbsoluto, true, n0)
        ]);
        h += card('Acuracidade', p2(pc.acuracidadePct), [
            { nome: 'Porcentagem', texto: 'Peças contadas ÷ peças no sistema. Sobras e faltas se compensam, e pode passar de 100%. Verde entre 99% e 101%, laranja entre 95% e 105%, vermelho fora disso.',
              conta: n0(pc.contadas) + ' ÷ ' + n0(pc.sistema) + ' × 100 = ' + res(p2(pc.acuracidadePct)) },
            vari(pc.acuracidadePct, pPc.acuracidadePct, false, p2)
        ]);

        // ---- Valor ----
        h += grupo('Valor (R$)');
        h += nota('Mesmas contas de peças, multiplicando cada linha pelo PREÇO UNITÁRIO.');
        h += card('Valor do sistema', r2(vl.sistema), [
            { nome: 'Valor', texto: 'Soma de QTDE ATUAL NO SISTEMA × PREÇO UNITÁRIO.', conta: '= ' + res(r2(vl.sistema)) },
            vari(vl.sistema, pVl.sistema, false, r2)
        ]);
        h += card('Valor contado', r2(vl.contado), [
            { nome: 'Valor', texto: 'Soma de QTDE NO FÍSICO × PREÇO UNITÁRIO.', conta: '= ' + res(r2(vl.contado)) },
            vari(vl.contado, pVl.contado, false, r2)
        ]);
        h += card('Ajustes positivos', r2(vl.ajustePositivo), [
            { nome: 'Valor', texto: 'Soma de diferença × preço nas linhas com sobra.', conta: '= ' + res(r2(vl.ajustePositivo)) },
            vari(vl.ajustePositivo, pVl.ajustePositivo, true, r2)
        ]);
        h += card('Ajustes negativos', r2(vl.ajusteNegativo), [
            { nome: 'Valor', texto: 'Soma de diferença × preço nas linhas com falta (sem o sinal).', conta: '= ' + res(r2(vl.ajusteNegativo)) },
            vari(vl.ajusteNegativo, pVl.ajusteNegativo, true, r2)
        ]);
        h += card('Ajuste absoluto', r2(vl.ajusteAbsoluto), [
            { nome: 'Valor', conta: r2(vl.ajustePositivo) + ' + ' + r2(vl.ajusteNegativo) + ' = ' + res(r2(vl.ajusteAbsoluto)) },
            vari(vl.ajusteAbsoluto, pVl.ajusteAbsoluto, true, r2)
        ]);
        h += card('Acuracidade', p2(vl.acuracidadePct), [
            { nome: 'Porcentagem', texto: 'Valor contado ÷ valor do sistema. Mesmas faixas de cor de peças.',
              conta: r2(vl.contado) + ' ÷ ' + r2(vl.sistema) + ' × 100 = ' + res(p2(vl.acuracidadePct)) },
            vari(vl.acuracidadePct, pVl.acuracidadePct, false, p2)
        ]);

        if (d.modoAno) {
            h += secao('Visão do ano', p('A linha "Total do ano" da tabela soma o ano inteiro (não é a média dos meses).' +
                (d.modoAnoMensal ? '' : ' O gráfico mês a mês ainda não está disponível no n8n; aparece o dia a dia.')));
        }
        return { titulo: 'Almoxarifado', sub: 'Acuracidade do inventário rotativo', html: h };
    };

    // =====================================================================
    // MARKETING
    // =====================================================================
    var MKT_PRESETS = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', 'mes_atual': 'Mês atual (até hoje)',
        'mes_anterior': 'Mês anterior', 'custom': 'Período personalizado' };

    function mktBase(st) {
        return filtro('<b>Base:</b> Google Analytics 4 (o Google Ads chega pelo GA4 vinculado).<br>' +
            'Período: <b>' + esc(MKT_PRESETS[st.activePreset] || st.activePreset) + '</b> — ' + dataBR(st.startDate) + ' a ' + dataBR(st.endDate) + '. Não há comparação com período anterior.');
    }
    function canais(st) {
        var pagos = ler('MKT_PAID_CHANNELS') || [];
        var org = { s: 0, u: 0 }, pag = { s: 0, u: 0 }, tot = 0;
        (st.data.byChannel || []).forEach(function (c) {
            var alvo = pagos.indexOf(c.channel) >= 0 ? pag : org;
            alvo.s += c.sessions || 0; alvo.u += c.activeUsers || 0; tot += c.sessions || 0;
        });
        return { org: org, pag: pag, tot: tot, pagos: pagos };
    }
    function duracao(seg) { seg = Number(seg) || 0; return Math.floor(seg / 60) + 'm ' + String(Math.floor(seg % 60)).padStart(2, '0') + 's'; }

    montadores.marketing_organico = function () {
        var st = ler('mktState');
        if (!st || !st.data || !st.data.summary) return semDados();
        var s = st.data.summary, c = canais(st);
        var share = c.tot ? c.org.s / c.tot * 100 : 0;
        var h = mktBase(st);
        h += nota('<b>Orgânico</b> = todo canal do GA4 que não é pago (' + esc(c.pagos.join(', ')) + '). Inclui Direct, Referral, Email, Organic Search, Organic Social etc.');
        h += grupo('Cartões');
        h += card('Sessões orgânicas', num(c.org.s), [
            { nome: 'Quantidade', texto: 'Soma das sessões dos canais orgânicos.', conta: '= ' + res(num(c.org.s)) },
            { nome: '% do total', texto: 'Sessões orgânicas ÷ sessões de todos os canais.', conta: num(c.org.s) + ' ÷ ' + num(c.tot) + ' × 100 = ' + res(pct(share)) }
        ]);
        h += card('Usuários', num(c.org.u), [
            { nome: 'Quantidade', texto: 'Soma dos usuários ativos dos canais orgânicos. Quem chegou por mais de um canal conta uma vez em cada.', conta: '= ' + res(num(c.org.u)) },
            { nome: 'Novos no total', texto: 'Usuários novos do <b>site inteiro</b> (orgânico + pago).', conta: '= ' + res(num(s.newUsers)) }
        ]);
        h += card('Páginas vistas', num(s.pageViews), [
            { nome: 'Quantidade', texto: 'Visualizações de página do <b>tráfego total</b> (orgânico + pago).', conta: '= ' + res(num(s.pageViews)) }
        ]);
        h += card('Tx. rejeição', pct((s.bounceRate || 0) * 100), [
            { nome: 'Porcentagem', texto: 'Sessões sem engajamento ÷ sessões, média ponderada pelas sessões do <b>tráfego total</b>.', conta: '= ' + res(pct((s.bounceRate || 0) * 100)) },
            { nome: 'Duração média', texto: 'Tempo médio por sessão, ponderado pelas sessões do tráfego total.', conta: '= ' + res(duracao(s.avgSessionDuration)) }
        ]);
        h += grupo('Gráficos e tabelas');
        h += lista([
            '<b>Sessões por dia</b>, <b>Dispositivos</b> e <b>Top 10 páginas</b>: tráfego total, não só orgânico.',
            '<b>Sessões por canal orgânico</b> e <b>Detalhamento por canal</b>: Share = sessões do canal ÷ sessões de todos os canais orgânicos.'
        ]);
        return { titulo: 'Marketing Orgânico', sub: 'Google Analytics 4', html: h };
    };

    montadores.marketing_pago = function () {
        var st = ler('mktState');
        if (!st || !st.data || !st.data.summary) return semDados();
        var s = st.data.summary, c = canais(st);
        var share = c.tot ? c.pag.s / c.tot * 100 : 0;
        var h = mktBase(st);
        if (!s.adSpend && !s.clicks && !s.impressions) h += nota('Tudo zerado: o Google Ads pode levar até 24h para aparecer no GA4.');
        h += grupo('Cartões');
        h += card('Investimento', brl(s.adSpend), [
            { nome: 'Valor', texto: 'Custo do Google Ads no período.', conta: '= ' + res(brl(s.adSpend)) },
            { nome: 'Sessões pagas e %', texto: 'Sessões dos canais pagos ÷ sessões de todos os canais.', conta: num(c.pag.s) + ' ÷ ' + num(c.tot) + ' × 100 = ' + res(pct(share)) }
        ]);
        h += card('Cliques', num(s.clicks), [
            { nome: 'Quantidade', texto: 'Cliques nos anúncios.', conta: '= ' + res(num(s.clicks)) },
            { nome: 'Impressões', texto: 'Vezes que os anúncios apareceram.', conta: '= ' + res(num(s.impressions)) }
        ]);
        h += card('CTR', pct(s.ctr, 2), [
            { nome: 'Porcentagem', texto: 'Cliques ÷ impressões.', conta: num(s.clicks) + ' ÷ ' + num(s.impressions) + ' × 100 = ' + res(pct(s.ctr, 2)) },
            { nome: 'CPC médio', texto: 'Custo ÷ cliques.', conta: brl(s.adSpend) + ' ÷ ' + num(s.clicks) + ' = ' + res(brl(s.cpc)) }
        ]);
        h += card('Conversões', num(s.adsConversions), [
            { nome: 'Quantidade', texto: 'Eventos-chave do GA4 vindos das campanhas.', conta: '= ' + res(num(s.adsConversions)) },
            { nome: 'CPA', texto: 'Custo ÷ conversões.', conta: brl(s.adSpend) + ' ÷ ' + num(s.adsConversions) + ' = ' + res(brl(s.cpa)) }
        ]);
        h += grupo('Tabela de campanhas');
        h += p('Mesmas contas por campanha. ROAS = receita ÷ custo. A coluna Status fica "-" porque o GA4 não envia o status da campanha.');
        return { titulo: 'Marketing Pago', sub: 'Google Ads via GA4', html: h };
    };

    montadores.admin = function () {
        return { titulo: 'Administração', sub: '', html: p('Esta tela não tem cálculos: aqui se gerenciam usuários, abas e permissões.') };
    };

    // ---------- montagem ----------
    function montar(pageId) {
        var fn = montadores[pageId];
        if (!fn && global.SF && SF.isOpPageId && SF.isOpPageId(pageId)) {
            return { titulo: 'Fluxo da OP', sub: 'ShopFloor', html: p('Esta aba mostra a tela "Fluxo da OP" do ShopFloor por dentro do dashboard. Os números são calculados pelo próprio ShopFloor, não pelo dashboard.') };
        }
        if (!fn) return { titulo: 'Como calculamos', sub: '', html: p('Esta aba mostra uma imagem fixa enviada pela equipe; não há cálculos do sistema nela.') };
        try {
            var r = fn();
            return typeof r === 'string' ? { titulo: 'Como calculamos', sub: '', html: r } : r; // semDados() devolve só o texto
        } catch (e) {
            return { titulo: 'Como calculamos', sub: '', html: p('Não consegui montar a explicação desta tela agora (' + esc(e.message) + ').') };
        }
    }

    global.AJUDA = { montar: montar, _fmt: { num: num, brl: brl, pct: pct, dataBR: dataBR, diasUteis: diasUteis } };
})(typeof window !== 'undefined' ? window : globalThis);
