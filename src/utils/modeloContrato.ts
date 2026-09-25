/**
 * Modelo de exemplo para os modelos de contrato (Configurações › Modelos de contrato). É só um ponto de
 * partida para editar: o texto jurídico deve ser revisado por quem cuida dos contratos.
 */
export const MODELO_CONTRATO_EXEMPLO = `<div style="text-align: center;">{{empresa_logo}}</div>
<h1 style="text-align: center;">CONTRATO DE LICENCIAMENTO DE SOFTWARE E PRESTAÇÃO DE SERVIÇOS</h1>
<p style="text-align: center;"><b>Contrato nº {{contrato_numero}}</b> — {{contrato_titulo}}</p>

<h2>1. DAS PARTES</h2>
<p><b>CONTRATADA:</b> {{empresa_nome}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}.</p>
<p><b>CONTRATANTE:</b> {{cliente_nome}}, inscrito(a) no CPF/CNPJ sob o nº {{cliente_documento}}, com endereço em {{cliente_endereco}}, e-mail {{cliente_email}}.</p>

<h2>2. DO OBJETO</h2>
<p>O presente contrato tem por objeto o licenciamento de uso e a prestação dos serviços descritos abaixo:</p>
{{itens}}

<h2>3. DA VIGÊNCIA</h2>
<p>Este contrato vigora {{vigencia}}. Renovação automática ao término da vigência: <b>{{renovacao_automatica}}</b>.</p>

<h2>4. DO VALOR E DO PAGAMENTO</h2>
<p>Pelos serviços, a CONTRATANTE pagará à CONTRATADA o valor de <b>{{valor_periodo}}</b> ({{valor_periodo_extenso}}), com periodicidade {{periodicidade}}, com vencimento no dia {{dia_vencimento}} de cada período, totalizando {{valor_total}} ({{valor_total_extenso}}) na vigência.</p>

<h2>5. DO REAJUSTE</h2>
<p>Os valores serão reajustados a cada 12 (doze) meses pela variação acumulada do índice {{indice_reajuste}}.</p>

<h2>6. DA RESCISÃO</h2>
<p>Qualquer das partes poderá rescindir este contrato mediante aviso prévio por escrito de 30 (trinta) dias, sem prejuízo dos valores devidos até a data da rescisão.</p>

<h2>7. DO FORO</h2>
<p>Fica eleito o foro da comarca da sede da CONTRATADA para dirimir quaisquer questões oriundas deste contrato.</p>

<p>{{observacoes}}</p>

<p style="margin-top: 32px;">E, por estarem de acordo, as partes assinam eletronicamente este instrumento.</p>
<p style="text-align: right;">{{data_hoje_extenso}}.</p>

<table style="width: 100%; margin-top: 56px;"><tbody><tr>
<td style="width: 50%; text-align: center; border-top: 1px solid #555; padding-top: 4px;">{{empresa_nome}}<br>CONTRATADA</td>
<td style="width: 8%;"></td>
<td style="width: 42%; text-align: center; border-top: 1px solid #555; padding-top: 4px;">{{cliente_nome}}<br>CONTRATANTE</td>
</tr></tbody></table>`;
