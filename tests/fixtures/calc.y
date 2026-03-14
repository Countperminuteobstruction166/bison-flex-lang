%{
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

extern int yylex(void);
void yyerror(const char *s);

double variables[26]; /* a-z */
%}

%define api.value.type union
%token <double> NUMBER
%token <int>    LETTER
%token PLUS     "+"
%token MINUS    "-"
%token TIMES    "*"
%token DIVIDE   "/"
%token LPAREN   "("
%token RPAREN   ")"
%token ASSIGN   "="
%token NEWLINE
%token EOL

%type <double> expr term factor primary

%left PLUS MINUS
%left TIMES DIVIDE
%right UMINUS

%start program

%%

program : lines ;

lines : lines line
      | line
      ;

line : expr NEWLINE               { printf("= %g\n", $1); }
     | LETTER ASSIGN expr NEWLINE { variables[$1] = $3; }
     | NEWLINE
     | error NEWLINE              { yyerrok; }
     ;

expr : expr PLUS term       { $$ = $1 + $3; }
     | expr MINUS term      { $$ = $1 - $3; }
     | term                 { $$ = $1; }
     ;

term : term TIMES factor    { $$ = $1 * $3; }
     | term DIVIDE factor   { $$ = $1 / $3; }
     | factor               { $$ = $1; }
     ;

factor : MINUS primary %prec UMINUS  { $$ = -$2; }
       | primary                     { $$ = $1; }
       ;

primary : NUMBER               { $$ = $1; }
        | LETTER               { $$ = variables[$1]; }
        | LPAREN expr RPAREN   { $$ = $2; }
        ;

%%

void yyerror(const char *s) {
  fprintf(stderr, "Error: %s\n", s);
}

int main(void) {
  return yyparse();
}
