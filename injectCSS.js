const fs = require('fs');
const path = require('path');

const previewPath = path.join(__dirname, 'public', 'all_widgets_preview.html');
const hydroCssPath = path.join(__dirname, 'src', 'components', 'GraphicsLibrary', 'HydrationOptionA.css');
const nutriCssPath = path.join(__dirname, 'src', 'components', 'GraphicsLibrary', 'NutritionOptionA.css');
const nextRaceCssPath = path.join(__dirname, 'src', 'components', 'GraphicsLibrary', 'NextRaceCard.css');
const coachCssPath = path.join(__dirname, 'src', 'components', 'Home', 'CoachDailySummaryCard.css');
const weeklyPlanCssPath = path.join(__dirname, 'src', 'components', 'Home', 'WeeklyPlanCard.css');

let previewHtml = fs.readFileSync(previewPath, 'utf8');
const hydroCss = fs.readFileSync(hydroCssPath, 'utf8');
const nutriCss = fs.readFileSync(nutriCssPath, 'utf8');
const nextRaceCss = fs.readFileSync(nextRaceCssPath, 'utf8');
const coachCss = fs.readFileSync(coachCssPath, 'utf8');
const weeklyPlanCss = fs.readFileSync(weeklyPlanCssPath, 'utf8');

const injection = `
/* ======== INJECTED FINAL WIDGET CSS ======== */
${nextRaceCss}
${hydroCss}
${nutriCss}
${coachCss}
${weeklyPlanCss}
/* ======== END INJECTED FINAL WIDGET CSS ======== */
`;

const start = previewHtml.indexOf('/* ======== INJECTED FINAL WIDGET CSS ======== */');
const endMarker = '/* ======== END INJECTED FINAL WIDGET CSS ======== */';
const end = previewHtml.indexOf(endMarker) + endMarker.length;

if (start !== -1 && previewHtml.indexOf(endMarker) !== -1) {
    previewHtml = previewHtml.substring(0, start) + injection + previewHtml.substring(end);
    fs.writeFileSync(previewPath, previewHtml, 'utf8');
    console.log('Successfully updated injected CSS.');
} else {
    console.error('Could not find existing injected block to replace!');
}
