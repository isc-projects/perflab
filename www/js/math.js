'use strict';

/* via https://msdn.microsoft.com/en-gb/magazine/mt620016.aspx */

// input = z-value (-inf to +inf)
// output = p under Standard Normal curve from -inf to z
// e.g., if z = 0.0, function returns 0.5000
// ACM Algorithm #209
Math.gauss = function(z) {
	var y; // 209 scratch variable
	var p; // result. called 'z' in 209
	var w; // 209 scratch variable

	if (z === 0.0) {
		p = 0.0;
	} else {
		y = Math.abs(z) / 2;
		if (y >= 3.0) {
			p = 1.0;
		} else if (y < 1.0) {
			w = y * y;
			p = ((((((((0.000124818987 * w
				- 0.001075204047) * w + 0.005198775019) * w
				- 0.019198292004) * w + 0.059054035642) * w
				- 0.151968751364) * w + 0.319152932694) * w
				- 0.531923007300) * w + 0.797884560593) * y * 2.0;
		} else {
			y = y - 2.0;
			p = (((((((((((((-0.000045255659 * y
				+ 0.000152529290) * y - 0.000019538132) * y
				- 0.000676904986) * y + 0.001390604284) * y
				- 0.000794620820) * y - 0.002034254874) * y
				+ 0.006549791214) * y - 0.010557625006) * y
				+ 0.011630447319) * y - 0.009279453341) * y
				+ 0.005353579108) * y - 0.002141268741) * y
				+ 0.000535310849) * y + 0.999936657524;
		}
	}

	if (z > 0.0) {
		return (p + 1.0) / 2;
	} else {
		return (1.0 - p) / 2;
	}
}

// for large integer df or double df
// adapted from ACM algorithm 395
// returns 2-tail p-value
Math.studentP = function(t, df) {
	var n = df; // to sync with ACM parameter name
	var a, b, y;
	t = t * t;
	y = t / n;
	b = y + 1.0;
	if (y > 1.0e-6) {
		y = Math.log(b);
	}
	a = n - 0.5;
	b = 48.0 * a * a;
	y = a * y;
	y = (((((-0.4 * y - 3.3) * y - 24.0) * y - 85.5) /
		(0.8 * y * y + 100.0 + b) + y + 3.0) / b + 1.0) *
		Math.sqrt(y);
	return 2.0 * Math.gauss(-y); // ACM algorithm 209
}
