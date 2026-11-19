import json,numpy as np,math
from scipy.spatial import cKDTree
P=json.load(open('props_before.json')); L=[list(map(float,l)) for l in P['lamps']]; S=np.array(P['sigs'])
R=json.load(open('probe_v.json'))
N0,N1=470,626
src=['orig']*N0+['side']*(N1-N0)+['viad']*(len(L)-N1)
# 1) viaduto: pousa o poste no topo da mureta (parede grossa >=0.8 m e 1.2-2.2 m de altura)
moved=0
for i,r in enumerate(R):
    k=N1+i
    if r['d1'] is None: continue
    rel=r['top']-r['g']
    if 1.2<rel<2.2 and r['flat']<0.1 and r['th']>0.8:
        L[k][0]=round(r['cx'],2); L[k][2]=round(r['cz'],2); L[k][1]=round(r['top'],3); moved+=1; src[k]='mur'
print('na mureta',moved)
# 2) remove postes colados em semaforos (a sinaleira ja tem poste/luz)
ts=cKDTree(S[:,[0,2]]); alive=[True]*len(L)
rem_sig=0
for i,l in enumerate(L):
    d,_=ts.query([l[0],l[2]])
    if d<11.0: alive[i]=False; rem_sig+=1
print('removidos perto de semaforo',rem_sig)
# 3) intercala lados: pares opostos (um de cada lado da rua, quase na mesma estacao) -> remove um, alternando o lado
idx=[i for i in range(len(L)) if alive[i]]
A=np.array([[L[i][0],L[i][2],L[i][3],L[i][4]] for i in idx])
pairs=[]
tr=cKDTree(A[:,:2]); used=set()
for a in range(len(idx)):
    for b in tr.query_ball_point(A[a,:2],62):
        if b<=a: continue
        ua,ub=A[a,2:],A[b,2:]
        if ua@ub>-0.75: continue
        dv=A[b,:2]-A[a,:2]; across=abs(dv@ua); along=abs(dv[0]*(-ua[1])+dv[1]*ua[0])
        # a esta em frente de b: b fica do lado para onde o braco de a aponta
        if dv@ua<=0 or not (3<across<62) or along>10: continue
        # nao pode haver cruzamento entre eles? (aceita)
        pairs.append((along,a,b))
pairs.sort()
paired=set(); P2=[]
for al,a,b in pairs:
    if a in paired or b in paired: continue
    paired.add(a); paired.add(b); P2.append((a,b))
print('pares opostos',len(P2))
# encadeia pares ao longo da rua: ordena por coordenada ao longo da rua dentro de cadeias
cent=np.array([(A[a,:2]+A[b,:2])/2 for a,b in P2]); tc=cKDTree(cent)
seen=set(); drop=[]
for k in range(len(P2)):
    if k in seen: continue
    # BFS cadeia: pares vizinhos (<48 m) com mesma orientacao
    comp=[k]; seen.add(k); q=[k]
    while q:
        c=q.pop()
        for m in tc.query_ball_point(cent[c],48):
            if m in seen: continue
            ua=A[P2[c][0],2:]; um=A[P2[m][0],2:]
            if abs(ua@um)<0.8 and abs(ua@A[P2[m][1],2:])<0.8: continue
            if abs(abs(ua@um)-1)>0.25 and abs(ua@um)<0.75: continue
            seen.add(m); comp.append(m); q.append(m)
    # direcao da rua = perpendicular ao braco do primeiro par
    a0=A[P2[comp[0]][0],2:]; st=np.array([-a0[1],a0[0]])
    comp.sort(key=lambda m: cent[m]@st)
    for n,m in enumerate(comp):
        a,b=P2[m]
        # referencia de lado: braco de 'a' vs a0
        sideA = (A[a,2:]@a0)>0
        # n par -> remove o lado 'a0'; n impar -> remove o oposto
        remove_a0side = (n%2==0)
        victim = a if (sideA==remove_a0side) else b
        if src[idx[a]]=='orig' and src[idx[b]]!='orig': victim=b
        elif src[idx[b]]=='orig' and src[idx[a]]!='orig': victim=a
        drop.append(idx[victim])
for i in drop: alive[i]=False
print('removidos por alternancia',len(drop))
newL=[ [round(v,3) for v in L[i]] for i in range(len(L)) if alive[i]]
print('lamps',len(L),'->',len(newL))
from collections import Counter; print(Counter(src[i] for i in range(len(L)) if alive[i]))
P['lamps']=newL; json.dump(P,open('props_new.json','w'),separators=(',',':'))
json.dump({'removed':[i for i in range(len(L)) if not alive[i]],'src':src},open('fix_info.json','w'))
