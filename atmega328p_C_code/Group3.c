#define F_CPU 16000000UL

#include <avr/io.h>
#include <util/delay.h>
#include <stdlib.h>
#include <string.h>
#include <util/twi.h>
#include <avr/interrupt.h>

/* ---------- PIN DEFINITIONS ---------- */
#define TRIG    PD3
#define ECHO    PD2

#define BUZZER  PB0
#define MOTOR1  PB1
#define MOTOR2  PB2

#define MOTOR_RUN_TIME 2000   // Gate movement time (adjust if needed)

/* ---------- UART BUFFER ---------- */
volatile char uart_buffer[20];
volatile uint8_t uart_index = 0;
volatile uint8_t uart_line_ready = 0;

/* ---------- UART INIT ---------- */
void uart_init()
{
    UBRR0H = 0;
    UBRR0L = 103;   // 9600 baud @ 16MHz

    UCSR0B = (1<<TXEN0) | (1<<RXEN0) | (1<<RXCIE0);   // TX, RX, RX interrupt
    UCSR0C = (1<<UCSZ01) | (1<<UCSZ00);               // 8-bit data
}

void uart_send(char c)
{
    while (!(UCSR0A & (1<<UDRE0)));
    UDR0 = c;
}

void uart_print(char *str)
{
    while (*str)
        uart_send(*str++);
}

/* ---------- UART RX INTERRUPT ---------- */
ISR(USART_RX_vect)
{
    char c = UDR0;

    if (c == '\r')
        return;

    if (uart_line_ready)
        return;   // wait until main loop processes current line

    if (c == '\n')
    {
        uart_buffer[uart_index] = '\0';
        uart_line_ready = 1;
        uart_index = 0;
    }
    else
    {
        if (uart_index < sizeof(uart_buffer) - 1)
        {
            uart_buffer[uart_index++] = c;
        }
        else
        {
            uart_index = 0;   // reset on overflow
        }
    }
}

/* ================= I2C + LCD ================= */

#define LCD_ADDR (0x27<<1)
#define EN 0x04
#define RS 0x01

void I2C_init() {
    PORTC |= (1<<PC4) | (1<<PC5);
    TWSR = 0x00;
    TWBR = 72;
    TWCR = (1<<TWEN);
}

void I2C_start(uint8_t address) {
    TWCR = (1<<TWINT)|(1<<TWSTA)|(1<<TWEN);
    while (!(TWCR & (1<<TWINT)));
    TWDR = address;
    TWCR = (1<<TWINT)|(1<<TWEN);
    while (!(TWCR & (1<<TWINT)));
}

void I2C_write(uint8_t data) {
    TWDR = data;
    TWCR = (1<<TWINT)|(1<<TWEN);
    while (!(TWCR & (1<<TWINT)));
}

void I2C_stop() {
    TWCR = (1<<TWINT)|(1<<TWEN)|(1<<TWSTO);
    _delay_ms(1);
}

void lcd_send(uint8_t data, uint8_t mode) {
    uint8_t high = data & 0xF0;
    uint8_t low  = (data << 4) & 0xF0;

    I2C_start(LCD_ADDR);
    I2C_write(high | mode | EN | 0x08);
    I2C_write(high | mode | 0x08);
    I2C_write(low | mode | EN | 0x08);
    I2C_write(low | mode | 0x08);
    I2C_stop();
}

void lcd_cmd(uint8_t cmd) {
    lcd_send(cmd, 0);
    _delay_ms(2);
}

void lcd_data(uint8_t data) {
    lcd_send(data, RS);
}

void lcd_init() {
    _delay_ms(50);
    lcd_cmd(0x33);
    lcd_cmd(0x32);
    lcd_cmd(0x28);
    lcd_cmd(0x0C);
    lcd_cmd(0x06);
    lcd_cmd(0x01);
}

void lcd_set_cursor(uint8_t row, uint8_t col) {
    uint8_t pos = (row==0) ? (0x80+col) : (0xC0+col);
    lcd_cmd(pos);
}

void lcd_print(char *str) {
    while(*str) lcd_data(*str++);
}

/* ---------- TIMER1 INIT ---------- */
void timer1_init()
{
    TCCR1B = (1<<CS11);
}

/* ---------- ULTRASONIC ---------- */
float measure_distance()
{
    PORTD |= (1<<TRIG);
    _delay_us(10);
    PORTD &= ~(1<<TRIG);

    while (!(PIND & (1<<ECHO)));
    TCNT1 = 0;
    while (PIND & (1<<ECHO));

    unsigned int count = TCNT1;
    float distance = count / 116.0;

    return distance;
}

/* ---------- BUZZER ---------- */

void buzzer_alarm()
{
    for(int i = 0; i < 5; i++)
    {
        PORTB |= (1<<BUZZER);
        _delay_ms(100);
        PORTB &= ~(1<<BUZZER);
    }
}

void buzzer_danger()
{
    PORTB |= (1<<BUZZER);
    _delay_ms(800);
}

/* ---------- MOTOR CONTROL ---------- */

void motor_open()
{
    PORTB |= (1<<MOTOR1);
    PORTB &= ~(1<<MOTOR2);
}

void motor_close()
{
    PORTB |= (1<<MOTOR2);
    PORTB &= ~(1<<MOTOR1);
}

void motor_stop()
{
    PORTB &= ~(1<<MOTOR1);
    PORTB &= ~(1<<MOTOR2);
}

void gate_open_sequence()
{
    motor_open();
    _delay_ms(MOTOR_RUN_TIME);
    motor_stop();
}

void gate_close_sequence()
{
    motor_close();
    _delay_ms(MOTOR_RUN_TIME);
    motor_stop();
}

/* ---------- UART COMMAND PROCESS ---------- */
void check_uart(char *gate_open, char *manual_override)
{
    if (!uart_line_ready)
        return;

    char cmd[20];
    cli();
    strcpy(cmd, (char*)uart_buffer);
    uart_line_ready = 0;
    sei();

    lcd_set_cursor(1,0);
    lcd_print("UART CMD:       ");
    lcd_set_cursor(1,10);
    lcd_print(cmd);

    PORTB |= (1<<BUZZER);
    _delay_ms(300);
    PORTB &= ~(1<<BUZZER);

    if (strcmp(cmd, "OPEN") == 0)
    {
        lcd_set_cursor(1,0);
        lcd_print("CMD OPEN        ");

        if (!(*gate_open))
        {
            gate_open_sequence();
            *gate_open = 1;
        }
        *manual_override = 1;
    }
    else if (strcmp(cmd, "CLOSE") == 0)
    {
        lcd_set_cursor(1,0);
        lcd_print("CMD CLOSE       ");

        if (*gate_open)
        {
            gate_close_sequence();
            *gate_open = 0;
        }
        *manual_override = 1;
    }
    else if (strcmp(cmd, "AUTO") == 0)
    {
        if (!(*gate_open))
        {
            lcd_set_cursor(1,0);
            lcd_print("CMD AUTO        ");
            *manual_override = 0;
        }
        else
        {
            lcd_set_cursor(1,0);
            lcd_print("CLOSE GATE 1ST  ");
        }   
    }
    else
    {
        lcd_set_cursor(1,0);
        lcd_print("CMD UNKNOWN     ");
    }
}

/* ---------- MAIN ---------- */
int main()
{
    DDRD |= (1<<TRIG);
    DDRD &= ~(1<<ECHO);

    DDRB |= (1<<BUZZER) | (1<<MOTOR1) | (1<<MOTOR2);

    motor_stop();

    uart_init();
    timer1_init();
    I2C_init();
    lcd_init();

    sei();   // enable global interrupts

    lcd_set_cursor(1,0);
    lcd_print("NEW CODE RUN    ");
    _delay_ms(1000);

    char last_state = 0;
    char gate_open = 0;
    char manual_override = 0;   // 0 = AUTO, 1 = MANUAL

    while (1)
    {
        check_uart(&gate_open, &manual_override);

        float distance = measure_distance();

        char buffer[10];
        dtostrf(distance, 4, 1, buffer);

        uart_print("LEVEL:");
        uart_print(buffer);

        char current_state;

        if (distance > 25.0)
            current_state = 1;   // SAFE
        else if (distance <= 10.0)
            current_state = 3;   // DANGER
        else
            current_state = 2;   // ALARM

        lcd_set_cursor(0,0);
        lcd_print("Level:      ");
        lcd_set_cursor(0,6);
        lcd_print(buffer);
        lcd_print("cm");

        if (current_state != last_state)
        {
            lcd_set_cursor(1,0);
            lcd_print("Status:        ");
            lcd_set_cursor(1,0);

            if (current_state == 1)
                lcd_print("Status: SAFE");
            else if (current_state == 2)
                lcd_print("Status: ALARM");
            else
                lcd_print("Status: DANGER");

            last_state = current_state;
        }

        if (current_state == 1)
        {
            PORTB &= ~(1<<BUZZER);

            uart_print(",STATE:SAFE");
            if (gate_open) uart_print(",GATE:OPEN");
            else uart_print(",GATE:CLOSED");

            if (manual_override) uart_print(",MODE:MANUAL\n");
            else uart_print(",MODE:AUTO\n");

            if (!manual_override)
            {
                if (gate_open){
                    gate_close_sequence();
                    gate_open = 0;
                }
            }
        }
        else if (current_state == 3)
        {
            buzzer_danger();

            uart_print(",STATE:DANGER");
            if (gate_open) uart_print(",GATE:OPEN");
            else uart_print(",GATE:CLOSED");

            if (manual_override) uart_print(",MODE:MANUAL\n");
            else uart_print(",MODE:AUTO\n");

            if (!manual_override)
            {
                if (!gate_open){
                    gate_open_sequence();
                    gate_open = 1;
                }
            }
        }
        else
        {
            buzzer_alarm();

            uart_print(",STATE:ALARM");
            if (gate_open) uart_print(",GATE:OPEN");
            else uart_print(",GATE:CLOSED");

            if (manual_override) uart_print(",MODE:MANUAL\n");
            else uart_print(",MODE:AUTO\n");
        }

        _delay_ms(500);
    }
}