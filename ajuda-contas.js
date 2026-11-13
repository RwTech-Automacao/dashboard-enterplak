// Painel "Como calculamos" (botão ? da barra superior).
// Cada aba tem um montador que lê o estado AO VIVO da tela (dados já carregados + filtros)
// e explica cada número com a conta feita e os valores daquele momento. Não busca nada novo.
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

    // ---------- blocos de texto ----------
    function secao(titulo, corpo) { return '<div class="ajuda-secao"><h4>' + esc(titulo) + '</h4>' + corpo + '</div>'; }
    function p(t) { return '<p>' + t + '</p>'; }
    function conta(t) { return '<div class="ajuda-conta">' + t + '</div>'; }
    function nota(t) { return '<p class="ajuda-nota">' + t + '</p>'; }
    function lista(itens) { return '<ul>' + itens.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'; }
    function res(t) { return '<span class="ajuda-res">' + t + '</span>'; }
    function filtro(t) { return '<div class="ajuda-filtro">' + t + '</div>'; }
    function semDados(t) { return p(t || 'Os dados desta tela ainda não carregaram. Abra a aba, espere carregar e clique no ? de novo.'); }

    // Lê uma variável global da tela pelo nome. As declaradas com let no index.html não ficam
    // em window, mas o corpo de new Function enxerga o escopo global inteiro. Nomes são fixos daqui.
    function ler(nome) {
        try { return new Function('return typeof ' + nome + " === 'undefined' ? undefined : " + nome)(); }
        catch (e) { return undefined; }
    }
    function existe(nome) { return ler(nome) !== undefined; }

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
        function pp(v) { return tot ? pct(v / tot * 100) : '0,0%'; }

        var h = filtro('<b>Base:</b> planilha de pedidos de compra (via n8n). ' +
            'Linhas na planilha: <b>' + num(all.length) + '</b> · depois dos filtros: <b>' + num(tot) + '</b>.<br>' +
            (f.length ? 'Filtros ativos: ' + f.join(' · ') : 'Nenhum filtro ativo.') +
            (val('filterDataDe') || val('filterDataAte') ? '<br>Com filtro de data, pedidos <b>sem data de embarque</b> ficam de fora.' : ''));

        h += secao('Total de Pedidos', p('Quantidade de linhas que passaram nos filtros.') + conta('= ' + res(num(tot)) + ' pedidos'));
        h += secao('OK · Resposta Pendente · Alerta de Problema',
            p('Conta quantos pedidos têm exatamente esse texto na coluna <b>Status</b>. O % é sobre o total.') +
            conta('OK: ' + num(ok) + ' ÷ ' + num(tot) + ' = ' + res(pp(ok)) + '\n' +
                'Resposta Pendente: ' + num(pend) + ' ÷ ' + num(tot) + ' = ' + res(pp(pend)) + '\n' +
                'Alerta de Problema (status "PROBLEMA NO PRAZO"): ' + num(prob) + ' ÷ ' + num(tot) + ' = ' + res(pp(prob))) +
            (outros > 0 ? nota('<b>' + num(outros) + '</b> pedido(s) têm outro status (ex.: "NENHUMA RESPOSTA" ou vazio). Eles entram no total, mas em nenhum dos 3 cartões — por isso os % não somam 100%.') : ''));
        h += secao('Gráficos de Alerta de Problema',
            lista([
                '<b>Por Embarque:</b> só os pedidos com Alerta de Problema, agrupados pela coluna Embarque (ou pelo código EMB do Fornecedor). Pedido sem embarque não aparece.',
                '<b>Por Responsável:</b> os mesmos pedidos, agrupados pela coluna Responsável. A soma das barras = ' + num(prob) + '.',
                '<b>Histórico — últimos 7 dias:</b> vem pronto da aba "histórico de alertas" da planilha (as 7 últimas linhas). <b>Não muda com os filtros.</b>'
            ]));
        h += secao('Tabela de detalhamento', p('Lista os ' + num(prob) + ' pedidos com Alerta de Problema, do embarque mais recente para o mais antigo.'));
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

        h += secao('Regras de cada cartão', lista([
            '<b>Total de itens:</b> linhas do embarque com pedido e código.',
            '<b>Itens recebidos:</b> itens com "Data de entrega do item" preenchida (e em formato de data).',
            '<b>% restante:</b> (total − recebidos) ÷ total × 100.',
            '<b>Entrega crítica:</b> item ainda não recebido cuja "Data prevista para entrega do item" está a <b>N dias ou menos</b> da data do embarque (Booking; sem booking, o Prazo). N = 5 para embarques terminados em EA (EUA), 10 para CA/CM (China), 7 para os demais. Item previsto para depois do embarque também é crítico.',
            '<b>Status:</b> dias até o <b>Prazo</b> do embarque (sem prazo, o Booking): menos de 7 dias = Próximo do embarque (vermelho); menos de 30 = Ajustes (amarelo); 30 ou mais = Planejamento (verde); sem data = SEM DATA.',
            '<b>Contagem regressiva:</b> até o Booking (sem booking, até o Prazo). Some quando a carga está em trânsito ou o embarque está concluído.',
            '<b>Prazo piscando:</b> o Booking está depois do Prazo.'
        ]));

        resumo.forEach(function (e) {
            var rec = e.itensRecebidos || 0, tot = e.totalItens || 0;
            var ref = e.bookingDate || e.prazoDate;
            var refNome = e.bookingDate ? 'Booking' : 'Prazo';
            var stRef = e.prazoDate ? 'Prazo' : (e.bookingDate ? 'Booking' : null);
            var linhas = 'Itens: ' + num(tot) + ' · recebidos: ' + num(rec) + '\n' +
                '% restante: (' + num(tot) + ' − ' + num(rec) + ') ÷ ' + num(tot) + ' = ' + res(pct(e.pctRestante || 0, 2)) + '\n' +
                'Entrega crítica: ' + res(num(e.itensCriticos || 0)) +
                (ref ? ' (limite ' + e.threshold + ' dias antes de ' + refNome + ' ' + dataBR(ref) + ')' : ' (sem Booking nem Prazo: não calcula)') + '\n' +
                'Status: ' + res(esc(e.status && e.status.label || '—')) +
                (stRef && e.diasAte !== null && !isNaN(e.diasAte) ? ' (' + num(e.diasAte) + ' dias até o ' + stRef + ')' : '');
            if (e.concluido) linhas += '\nEmbarque marcado como concluído.';
            else if (e.emTransito) linhas += '\nCarga em trânsito.';
            h += secao(e.nome, conta(linhas));
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

        var pctProd = data.metaProducao > 0 ? data.producao / data.metaProducao * 100 : 0;
        var metaHojeQtd = du.total ? data.metaProducao / du.total * duHoje : 0;
        var noPrazo = data.producao >= metaHojeQtd;
        var pctFat = data.metaFaturamento > 0 ? data.faturado / data.metaFaturamento * 100 : 0;
        var sel = ler('faturamentoProjetoSelecionado');

        var h = filtro('<b>Base:</b> Kanban PRO — entregas planejadas e notas fiscais dos cards de venda.<br>' +
            'Mês selecionado: <b>' + esc(m.label) + '</b>' + (sel ? ' · Cliente selecionado: <b>' + esc(sel) + '</b> (muda só o gráfico)' : '') + '.<br>' +
            'Entram só as entregas planejadas e as notas <b>com data dentro desse mês</b>.');

        h += secao('% produzido (barra principal)',
            p('Peças faturadas no mês ÷ peças com entrega planejada no mês. "Produzido" aqui é a <b>quantidade das notas</b> lançadas no Kanban.') +
            conta(num(data.producao) + ' ÷ ' + num(data.metaProducao) + ' = ' + res(pct(pctProd))));
        h += secao('Meta hoje',
            p('A meta é uma linha reta: o mês inteiro dividido igualmente pelos dias úteis (seg–sex, <b>feriados não são descontados</b>; hoje já conta).') +
            conta('Dias úteis do mês: ' + du.total + ' · até hoje: ' + duHoje + '\n' +
                duHoje + ' ÷ ' + du.total + ' = ' + res(pct(pctMeta)) + '\n' +
                'Em peças: ' + num(data.metaProducao) + ' ÷ ' + du.total + ' × ' + duHoje + ' = ' + res(num(metaHojeQtd))));
        h += secao('NO PRAZO / ATRASADO',
            p('Compara as peças faturadas com a meta de hoje. <b>Não olha a data prevista de cada entrega</b>: se tudo está planejado para o fim do mês, pode aparecer ATRASADO mesmo sem nada vencido.') +
            conta(num(data.producao) + (noPrazo ? ' ≥ ' : ' < ') + num(metaHojeQtd) + ' → ' + res(noPrazo ? 'NO PRAZO' : 'ATRASADO') + '\n' +
                'Diferença: ' + num(pctProd, 1) + '% − ' + num(pctMeta, 1) + '% = ' + res((pctProd - pctMeta >= 0 ? '+' : '') + num(pctProd - pctMeta, 1) + ' p.p.')));
        h += secao('Faturamento real',
            p('Valor em reais das notas ÷ valor em reais das entregas planejadas. Entrega = (valor fixo + câmbio do pedido × valor variável) × quantidade; nota = mesmo cálculo com o câmbio da nota.') +
            conta(brl(data.faturado) + ' ÷ ' + brl(data.metaFaturamento) + ' = ' + res(pct(pctFat))) +
            nota('Pode ser diferente do % produzido: peças caras e baratas pesam igual em quantidade, mas não em valor.'));
        h += secao('Gráfico "Evolução do faturamento no mês"',
            p('Em <b>reais</b>, acumulado dia a dia: soma das notas até o dia ÷ valor planejado do mês' + (sel ? ' do cliente ' + esc(sel) : '') +
              '. A linha tracejada é a mesma meta em linha reta (só sobe em dia útil). Verde se o realizado está acima da linha no último dia, vermelho se abaixo.'));

        var projs = data.projetos || [];
        if (projs.length) {
            var linhas = projs.map(function (pj) {
                var pp = pj.metaProducao > 0 ? pj.producao / pj.metaProducao * 100 : 0;
                var mh = du.total ? pj.metaProducao / du.total * duHoje : 0;
                var pf = pj.metaFaturamento > 0 ? pj.faturado / pj.metaFaturamento * 100 : 0;
                return '<b>' + esc(pj.nome) + '</b>: ' + num(pj.producao) + ' ÷ ' + num(pj.metaProducao) + ' peças = ' + pct(pp) +
                    ' · meta hoje ' + num(mh) + ' → ' + (pj.producao >= mh ? 'NO PRAZO' : 'ATRASADO') +
                    ' · FAT ' + brl(pj.faturado, 0) + ' ÷ ' + brl(pj.metaFaturamento, 0) + ' = ' + pct(pf);
            });
            h += secao('Por cliente', p('Mesmas contas, só com as entregas e notas de cada cliente.') + lista(linhas));
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
        var linhasMes = meses.map(function (mm) {
            var chave = nomes[mm - 1] + '/' + m.yy, v = porMes[chave] || 0;
            real += v;
            return '<b>' + esc(nomes[mm - 1]) + '</b>: ' + brl(v, 0) + ' ÷ ' + brl(metaMes, 0) + ' = ' + pct(metaMes ? v / metaMes * 100 : 0);
        });
        var pctTrim = META ? real / META * 100 : 0;
        var noPrazo = pctTrim >= pctMeta;
        var selMes = ler('vendasMesSelecionado');

        var h = filtro('<b>Base:</b> Kanban PRO — cards de prospecção marcados como <b>Ganho</b>, só pedidos em <b>reais (BRL)</b>.<br>' +
            'Cada venda entra no mês da <b>data de aprovação</b>. Trimestre: <b>' + trim + 'º/' + esc(m.yy) + '</b> (definido pelo mês selecionado, ' + esc(m.label) + ').' +
            (selMes ? '<br>Mês clicado: <b>' + esc(selMes) + '</b> (muda só o gráfico).' : ''));

        h += secao('Meta de vendas do trimestre',
            p('Soma das vendas aprovadas nos 3 meses ÷ meta fixa do trimestre.') +
            conta(brl(real, 0) + ' ÷ ' + brl(META, 0) + ' = ' + res(pct(pctTrim))));
        h += secao('Meta hoje e NO PRAZO / ATRASADO',
            p('Linha reta pelos dias úteis do trimestre (seg–sex, sem feriados).') +
            conta('Dias úteis: ' + duHoje + ' de ' + du.total + ' = ' + res(pct(pctMeta)) + '\n' +
                num(pctTrim, 1) + '% ' + (noPrazo ? '≥' : '<') + ' ' + num(pctMeta, 1) + '% → ' + res(noPrazo ? 'NO PRAZO' : 'ATRASADO')));
        h += secao('Cartões por mês (meta mensal = 1/3 do trimestre)',
            lista(linhasMes) +
            nota('Meta esperada de cada mês: 100% para meses antes do selecionado, 0% para os depois, e linha reta pelos dias úteis no mês selecionado.'));
        h += secao('Gráfico "Evolução das vendas"',
            p('Vendas acumuladas dia a dia ÷ meta do período (trimestre inteiro, ou 1/3 se um mês estiver clicado), contra a linha reta de dias úteis. A tela mostra só %; os valores em reais aparecem aqui.'));
        return { titulo: 'Vendas', sub: 'Trimestre ' + trim + 'º/' + m.yy, html: h };
    };

    // =====================================================================
    // ALMOXARIFADO
    // =====================================================================
    var ALM_PRESETS = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', 'mes_atual': 'Mês atual',
        'mes_anterior': 'Mês anterior', 'ano': 'Ano (01/01 até hoje)', 'custom': 'Período personalizado' };

    montadores.almoxarifado = function () {
        var st = ler('almState');
        if (!st || !st.data || !st.data.current) return semDados();
        var d = st.data, c = d.current, it = c.itens || {}, pc = c.pecas || {}, vl = c.valor || {};
        var dias = (d.period && d.period.days) || 0;
        var metaMensal = existe('almMetaMensal') ? ler('almMetaMensal')() : 0;
        var meta = metaMensal * dias / 30;
        var ating = meta > 0 ? (it.contados || 0) / meta * 100 : 0;

        var h = filtro('<b>Base:</b> planilha "Tabela oficial do inventário rotativo" (via n8n).<br>' +
            'Período: <b>' + esc(ALM_PRESETS[st.activePreset] || st.activePreset) + '</b> — ' + dataBR(st.startDate) + ' a ' + dataBR(st.endDate) + ' (' + dias + ' dias).<br>' +
            'Estoque: <b>' + esc(st.estoque || 'Todos') + '</b> (coluna ESTOQUE).<br>' +
            'Cada linha da planilha com <b>MÊS DA CONTAGEM</b> dentro do período = 1 item contado. Linhas com a data fora do formato dd/mm/aaaa são <b>ignoradas</b>.' +
            (d.modoAno ? '' : '<br>Comparação (▲▼): mesmo número de dias logo antes, de ' + dataBR(d.previousPeriod && d.previousPeriod.startDate) + ' a ' + dataBR(d.previousPeriod && d.previousPeriod.endDate) + '.'));

        h += secao('Como uma linha vira divergência',
            p('Diferença = <b>QTDE NO FÍSICO − QTDE ATUAL NO SISTEMA</b> (ou a coluna Diferença, se existir).') +
            lista(['Diferença maior que 0 → <b>divergência positiva</b> (sobra)', 'Diferença menor que 0 → <b>divergência negativa</b> (falta)', 'Diferença 0 → <b>sem divergência</b>']));

        h += secao('Itens (SKUs)',
            conta('Itens contados: ' + res(num(it.contados)) + '\n' +
                'Sem divergências: ' + num(it.semDivergencia) + ' · positivas: ' + num(it.divPositiva) + ' · negativas: ' + num(it.divNegativa) + '\n' +
                'Ajuste absoluto: ' + num(it.divPositiva) + ' + ' + num(it.divNegativa) + ' = ' + res(num(it.ajusteAbsoluto)) + '\n' +
                'Acuracidade: ' + num(it.semDivergencia) + ' ÷ ' + num(it.contados) + ' = ' + res(pct(it.acuracidadePct, 2))) +
            nota('Cor da acuracidade: verde a partir de 95%, laranja a partir de 80%, vermelho abaixo.'));
        h += secao('Meta de itens contados',
            p('Meta mensal ajustada ao tamanho do período (meta ÷ 30 × dias).') +
            conta(num(metaMensal) + ' ÷ 30 × ' + dias + ' = ' + res(num(meta)) + ' itens\n' +
                num(it.contados) + ' ÷ ' + num(meta) + ' = ' + res(pct(ating))) +
            nota('Meta usada: ' + (st.estoque ? 'a do estoque filtrado' : 'Meta PA + Meta MP') + '. Barra verde a partir de 100%, amarela a partir de 70%, vermelha abaixo.'));
        h += secao('Peças (quantidade)',
            conta('No sistema: ' + num(pc.sistema) + ' · contadas: ' + num(pc.contadas) + '\n' +
                'Positivas (sobra): ' + num(pc.divPositiva) + ' · negativas (falta): ' + num(pc.divNegativa) + '\n' +
                'Acuracidade: ' + num(pc.contadas) + ' ÷ ' + num(pc.sistema) + ' = ' + res(pct(pc.acuracidadePct, 2))) +
            nota('É uma razão de totais: sobras e faltas se compensam e pode passar de 100%. Verde entre 99% e 101%, laranja entre 95% e 105%.'));
        h += secao('Valor (R$)',
            p('Mesmas contas de peças, multiplicando cada linha pelo PREÇO UNITÁRIO.') +
            conta('Sistema: ' + brl(vl.sistema) + ' · contado: ' + brl(vl.contado) + '\n' +
                'Ajustes positivos: ' + brl(vl.ajustePositivo) + ' · negativos: ' + brl(vl.ajusteNegativo) + '\n' +
                'Acuracidade: ' + brl(vl.contado) + ' ÷ ' + brl(vl.sistema) + ' = ' + res(pct(vl.acuracidadePct, 2))));
        if (!d.modoAno && d.previous) {
            h += secao('Setas de comparação (▲▼)',
                p('(período atual − período anterior) ÷ período anterior × 100. Nos cartões de divergência e ajuste, <b>cair é bom</b> (seta verde).') +
                conta('Itens contados no período anterior: ' + num(d.previous.itens && d.previous.itens.contados)));
        }
        if (d.modoAno) {
            h += secao('Visão do ano', p('Totais de 01/01 até hoje. A linha "Total do ano" da tabela soma o ano inteiro (não é a média dos meses). Não há comparação com período anterior.' +
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

    montadores.marketing_organico = function () {
        var st = ler('mktState');
        if (!st || !st.data || !st.data.summary) return semDados();
        var s = st.data.summary, c = canais(st);
        var h = mktBase(st);
        h += secao('O que é orgânico', p('Todo canal do GA4 que <b>não</b> é pago (' + esc(c.pagos.join(', ')) + '). Inclui Direct, Referral, Email, Organic Search, Organic Social etc.'));
        h += secao('Sessões orgânicas',
            conta(res(num(c.org.s)) + ' sessões\n% do total: ' + num(c.org.s) + ' ÷ ' + num(c.tot) + ' = ' + res(pct(c.tot ? c.org.s / c.tot * 100 : 0))));
        h += secao('Usuários', conta('Soma dos usuários ativos dos canais orgânicos = ' + res(num(c.org.u))) +
            nota('Quem chegou por mais de um canal conta uma vez em cada. "' + num(s.newUsers) + ' novos" é do site inteiro.'));
        h += secao('Páginas vistas e taxa de rejeição',
            conta('Páginas vistas: ' + res(num(s.pageViews)) + '\nTaxa de rejeição: ' + res(pct((s.bounceRate || 0) * 100)) + ' (média ponderada pelas sessões)') +
            nota('Esses dois números, o gráfico por dia, os dispositivos e as top páginas são do <b>tráfego total</b> (orgânico + pago), não só orgânico.'));
        h += secao('Detalhamento por canal', p('Share = sessões do canal ÷ sessões de todos os canais orgânicos.'));
        return { titulo: 'Marketing Orgânico', sub: 'Google Analytics 4', html: h };
    };

    montadores.marketing_pago = function () {
        var st = ler('mktState');
        if (!st || !st.data || !st.data.summary) return semDados();
        var s = st.data.summary, c = canais(st);
        var h = mktBase(st);
        h += secao('Investimento', conta('Custo do Google Ads no período = ' + res(brl(s.adSpend)) + '\nSessões pagas: ' + num(c.pag.s) + ' de ' + num(c.tot) + ' = ' + pct(c.tot ? c.pag.s / c.tot * 100 : 0)));
        h += secao('Cliques e CTR', conta('Cliques: ' + num(s.clicks) + ' · impressões: ' + num(s.impressions) + '\nCTR: ' + num(s.clicks) + ' ÷ ' + num(s.impressions) + ' × 100 = ' + res(pct(s.ctr, 2)) + '\nCPC médio: ' + brl(s.adSpend) + ' ÷ ' + num(s.clicks) + ' = ' + res(brl(s.cpc))));
        h += secao('Conversões e CPA', conta('Conversões (eventos-chave do GA4 nas campanhas): ' + res(num(s.adsConversions)) + '\nCPA: ' + brl(s.adSpend) + ' ÷ ' + num(s.adsConversions) + ' = ' + res(brl(s.cpa))));
        h += secao('Tabela de campanhas', p('Mesmas contas por campanha. ROAS = receita ÷ custo. A coluna Status fica "-" porque o GA4 não envia o status da campanha.'));
        if (!s.adSpend && !s.clicks && !s.impressions) h += nota('Tudo zerado: o Google Ads pode levar até 24h para aparecer no GA4.');
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
        }
        catch (e) { return { titulo: 'Como calculamos', sub: '', html: p('Não consegui montar a explicação desta tela agora (' + esc(e.message) + ').') }; }
    }

    global.AJUDA = { montar: montar, _fmt: { num: num, brl: brl, pct: pct, dataBR: dataBR, diasUteis: diasUteis } };
})(typeof window !== 'undefined' ? window : globalThis);
