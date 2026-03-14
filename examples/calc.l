%{
#include <stdio.h>
#include "calc.tab.h"
%}

%option noyywrap nounput noinput

%x COMMENT
%s MATH

DIGIT    [0-9]
INTEGER  {DIGIT}+
FLOAT    {DIGIT}+"."{DIGIT}*
WS       [ \t]+
ID       [a-zA-Z_][a-zA-Z0-9_]*

%%

"/*"            { BEGIN(COMMENT); }
<COMMENT>"*/"   { BEGIN(INITIAL); }
<COMMENT>.      { /* skip */ }
<COMMENT>\n     { /* skip */ }

<MATH>{INTEGER}    { return NUMBER; }
<MATH>{FLOAT}      { return NUMBER; }
{INTEGER}          { return NUMBER; }
{FLOAT}            { return NUMBER; }
{ID}               { return IDENTIFIER; }

"+"             { return PLUS; }
"-"             { return MINUS; }
"*"             { return TIMES; }
"/"             { return DIVIDE; }
"("             { return LPAREN; }
")"             { return RPAREN; }
"="             { return ASSIGN; }
";"             { return SEMICOLON; }

{WS}            { /* skip whitespace */ }
\n              { /* skip newlines */ }

.               { fprintf(stderr, "Unknown char: %s\n", yytext); }

%%
