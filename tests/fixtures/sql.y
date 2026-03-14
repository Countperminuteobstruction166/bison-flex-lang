%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern int yylex(void);
void yyerror(const char *s);
%}

%define api.value.type union

%token <char *> IDENTIFIER
%token <char *> STRING_LIT
%token <double> NUMBER

%token SELECT   "SELECT"
%token FROM     "FROM"
%token WHERE    "WHERE"
%token INSERT   "INSERT"
%token INTO     "INTO"
%token VALUES   "VALUES"
%token CREATE   "CREATE"
%token TABLE    "TABLE"
%token DROP     "DROP"
%token AND      "AND"
%token OR       "OR"
%token NOT      "NOT"
%token NULL_TOK "NULL"
%token INT_TYPE "INT"
%token VARCHAR  "VARCHAR"
%token TEXT     "TEXT"

%token STAR     "*"
%token COMMA    ","
%token LPAREN   "("
%token RPAREN   ")"
%token SEMI     ";"
%token EQ       "="
%token NE       "!="
%token LT       "<"
%token GT       ">"
%token LE       "<="
%token GE       ">="
%token DOT      "."

%type <void *> statement select_stmt insert_stmt create_stmt drop_stmt
%type <void *> column_list expr_list where_clause condition
%type <void *> expr column_def column_defs data_type table_ref

%left OR
%left AND
%right NOT

%start program

%%

program : statements ;

statements : statements statement SEMI
           | statement SEMI
           ;

statement : select_stmt          { $$ = $1; }
          | insert_stmt          { $$ = $1; }
          | create_stmt          { $$ = $1; }
          | drop_stmt            { $$ = $1; }
          ;

select_stmt : SELECT column_list FROM table_ref where_clause  { $$ = NULL; }
            | SELECT STAR FROM table_ref where_clause          { $$ = NULL; }
            ;

column_list : column_list COMMA expr   { $$ = $3; }
            | expr                     { $$ = $1; }
            ;

table_ref : IDENTIFIER                   { $$ = NULL; }
          | IDENTIFIER DOT IDENTIFIER    { $$ = NULL; }
          ;

where_clause : WHERE condition      { $$ = $2; }
             | %empty               { $$ = NULL; }
             ;

condition : expr EQ expr                  { $$ = NULL; }
          | expr NE expr                  { $$ = NULL; }
          | expr LT expr                  { $$ = NULL; }
          | expr GT expr                  { $$ = NULL; }
          | expr LE expr                  { $$ = NULL; }
          | expr GE expr                  { $$ = NULL; }
          | condition AND condition       { $$ = NULL; }
          | condition OR condition        { $$ = NULL; }
          | NOT condition                 { $$ = $2; }
          | LPAREN condition RPAREN       { $$ = $2; }
          ;

expr : IDENTIFIER                   { $$ = NULL; }
     | STRING_LIT                   { $$ = $1; }
     | NUMBER                       { $$ = NULL; }
     | NULL_TOK                     { $$ = NULL; }
     | IDENTIFIER DOT IDENTIFIER    { $$ = NULL; }
     ;

insert_stmt : INSERT INTO IDENTIFIER LPAREN column_list RPAREN VALUES LPAREN expr_list RPAREN  { $$ = NULL; }
            | INSERT INTO IDENTIFIER VALUES LPAREN expr_list RPAREN                            { $$ = NULL; }
            ;

expr_list : expr_list COMMA expr { $$ = $3; }
          | expr                 { $$ = $1; }
          ;

create_stmt : CREATE TABLE IDENTIFIER LPAREN column_defs RPAREN  { $$ = NULL; }
            ;

column_defs : column_defs COMMA column_def   { $$ = $3; }
            | column_def                     { $$ = $1; }
            ;

column_def : IDENTIFIER data_type                { $$ = NULL; }
           | IDENTIFIER data_type NOT NULL_TOK    { $$ = NULL; }
           ;

data_type : INT_TYPE                       { $$ = NULL; }
          | VARCHAR LPAREN NUMBER RPAREN   { $$ = NULL; }
          | TEXT                           { $$ = NULL; }
          ;

drop_stmt : DROP TABLE IDENTIFIER   { $$ = NULL; }
          ;

%%

void yyerror(const char *s) {
  fprintf(stderr, "SQL parse error: %s\n", s);
}

int main(void) {
  return yyparse();
}
